// Offline-Betrieb: Abfrage-Cache auf dem Gerät (IndexedDB) und Warteschlange für Meldungen.
//
// * Alle geladenen Daten (Gruppen, Reviere, Jagden, Stände, Meldungen …) werden pro Benutzer in
//   IndexedDB gespeichert und beim nächsten Start sofort angezeigt, auch ohne Netz.
// * Meldungen, die ohne Netz abgeschickt werden, bleiben als pausierte Mutation in der Warteschlange,
//   werden mitgespeichert und nach einem Neustart weiter übertragen. Die Geräte-ID der Meldung
//   verhindert Dubletten, wenn eine Antwort im Funkloch verloren geht.
// * Beim Abmelden wird alles gelöscht.
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { onlineManager, type QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';
import type { Services } from '../app/services';
import type { ChatMessage, MessageInput } from '../features/chat/chatModel';
import type { Report, ReportInput } from '../features/hunts/huntModel';
import { mapError } from './errors';

export const CACHE_KEY = 'drueckjagd-query-cache';
/** Erhöhen, wenn sich die Form der gespeicherten Daten ändert. */
const CACHE_VERSION = 'v1';
const MAX_AGE = 1000 * 60 * 60 * 24 * 14;

export const REPORT_MUTATION_KEY = ['hunt-report', 'create'] as const;
export interface ReportVariables {
  huntId: string;
  input: ReportInput;
}

const reportsKey = (huntId: string) => ['hunts', 'one', huntId, 'reports'];

export const MESSAGE_MUTATION_KEY = ['chat-message', 'send'] as const;
export interface MessageVariables {
  groupId: string;
  input: MessageInput;
}
export const chatKey = (groupId: string) => ['chat', groupId] as const;

/** Mutationen, die in der Warteschlange überleben (Meldungen und Chatnachrichten). */
export const QUEUED_MUTATION_KEYS: readonly string[] = [REPORT_MUTATION_KEY[0], MESSAGE_MUTATION_KEY[0]];

const retryOffline = {
  // Auch bei scheinbarem Netz (Funkloch mit WLAN-Symbol) weiter versuchen, bis es klappt.
  networkMode: 'online' as const,
  retry: (_count: number, error: Error) => mapError(error).kind === 'network',
  retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 30_000),
};

/**
 * Standardverhalten für Mutationen, die auch nach einem Neustart fortgesetzt werden müssen. Die
 * Funktion muss hier stehen (nicht nur im Hook), sonst weiß der wiederhergestellte Cache nicht,
 * wie er die gespeicherte Meldung senden soll.
 */
export function registerOfflineMutations(client: QueryClient, services: Pick<Services, 'hunts' | 'chat' | 'push'>, userId: string) {
  client.setMutationDefaults(REPORT_MUTATION_KEY, {
    mutationFn: async ({ huntId, input }: ReportVariables) => {
      await services.hunts.createReport(huntId, input);
      // Erst nach dem Speichern, damit auch eine im Funkloch gemeldete Nachsuche alarmiert.
      if (input.kind === 'angeschossen') void services.push.notify({ type: 'report', id: input.id });
    },
    ...retryOffline,
    onMutate: async ({ huntId, input }: ReportVariables) => {
      await client.cancelQueries({ queryKey: reportsKey(huntId) });
      client.setQueryData<Report[]>(reportsKey(huntId), (old = []) =>
        old.some((r) => r.id === input.id)
          ? old
          : [{ ...input, huntId, reporterId: userId, reporterName: null, resolvedAt: null, pending: true }, ...old],
      );
    },
    onSettled: (_data, _error, { huntId }: ReportVariables) => client.invalidateQueries({ queryKey: reportsKey(huntId) }),
  });

  client.setMutationDefaults(MESSAGE_MUTATION_KEY, {
    mutationFn: async ({ groupId, input }: MessageVariables) => {
      await services.chat.send(groupId, input);
      void services.push.notify({ type: 'message', id: input.id });
    },
    ...retryOffline,
    onMutate: async ({ groupId, input }: MessageVariables) => {
      await client.cancelQueries({ queryKey: chatKey(groupId) });
      client.setQueryData<ChatMessage[]>(chatKey(groupId), (old = []) =>
        old.some((m) => m.id === input.id)
          ? old
          : [...old, { id: input.id, groupId, senderId: userId, senderName: null, content: input.content, createdAt: new Date().toISOString(), pending: true }],
      );
    },
    onSettled: (_data, _error, { groupId }: MessageVariables) => client.invalidateQueries({ queryKey: chatKey(groupId) }),
  });
}

function idbStorage() {
  return {
    getItem: (key: string) => get<string>(key).then((v) => v ?? null),
    setItem: (key: string, value: string) => set(key, value),
    removeItem: (key: string) => del(key),
  };
}

/**
 * Stellt den gespeicherten Cache des Benutzers wieder her und speichert ihn ab jetzt laufend.
 * Gibt eine Funktion zurück, die das Speichern beendet.
 */
export async function startPersistence(client: QueryClient, userId: string): Promise<() => void> {
  // TanStack Query nimmt beim Start „online“ an und hört nur auf spätere Ereignisse. Nach einem
  // Neustart ohne Netz würde es sonst sofort senden wollen, statt die Meldungen zu pausieren.
  onlineManager.setOnline(navigator.onLine);
  const persister = createAsyncStoragePersister({ storage: idbStorage(), key: CACHE_KEY, throttleTime: 1000 });
  const [unsubscribe, restored] = persistQueryClient({
    queryClient: client,
    persister,
    maxAge: MAX_AGE,
    // Anderer Benutzer oder neue Datenform: gespeicherten Cache verwerfen.
    buster: `${CACHE_VERSION}:${userId}`,
    dehydrateOptions: {
      // Auch Meldungen speichern, die gerade (vergeblich) wiederholt werden, nicht nur pausierte:
      // im Funkloch meldet der Browser oft Netz, obwohl keins da ist.
      shouldDehydrateMutation: (m) => m.state.isPaused || (m.state.status === 'pending' && QUEUED_MUTATION_KEYS.includes(String(m.options.mutationKey?.[0]))),
    },
  });
  await restored.catch(() => undefined);
  // Gespeicherte Daten sofort zeigen, aber mit Netz gleich frisch laden (z. B. neue Standzuteilung).
  void client.invalidateQueries();
  // Gespeicherte Meldungen aus der Warteschlange weiter senden.
  void client.resumePausedMutations();
  // iOS räumt Website-Daten sonst nach einigen Tagen ohne Nutzung auf.
  void navigator.storage?.persist?.().catch(() => false);
  return unsubscribe;
}

/** Beim Abmelden: Cache im Speicher und auf dem Gerät löschen. */
export async function clearPersistence(client: QueryClient) {
  client.clear();
  try {
    // Ohne IndexedDB (privater Modus, Tests) wirft idb-keyval synchron.
    await del(CACHE_KEY);
  } catch {
    // Nichts gespeichert, nichts zu löschen.
  }
}
