// Zustand der Standortfreigabe, app-weit (läuft weiter, wenn man innerhalb der App die Seite wechselt).
// Gespeichert wird nur, für welche Jagd geteilt wird, damit es nach einem Neustart der App
// weitergehen kann; die Datenbank prüft bei jedem Senden, ob das noch erlaubt ist.
import { useSyncExternalStore } from 'react';

export interface LiveSettings {
  huntId: string;
  huntTitle: string;
  /** Bildschirm anlassen (Wake Lock), damit das Teilen nicht abbricht. */
  keepAwake: boolean;
}

export type LiveStatus =
  | { kind: 'off'; reason?: string }
  | { kind: 'waiting' }
  | { kind: 'sharing'; lastSentAt: number | null; accuracy: number | null }
  | { kind: 'error'; message: string };

const KEY = 'drueckjagd-live-sharing';

function load(): LiveSettings | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LiveSettings) : null;
  } catch {
    return null;
  }
}

let settings: LiveSettings | null = load();
let status: LiveStatus = { kind: 'off' };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export const liveStore = {
  get: () => settings,
  status: () => status,
  start(next: LiveSettings) {
    settings = next;
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Ohne Speicher endet das Teilen beim Neustart.
    }
    emit();
  },
  update(patch: Partial<LiveSettings>) {
    if (settings) liveStore.start({ ...settings, ...patch });
  },
  stop(reason?: string) {
    settings = null;
    status = { kind: 'off', reason };
    try {
      localStorage.removeItem(KEY);
    } catch {
      // nichts zu tun
    }
    emit();
  },
  setStatus(next: LiveStatus) {
    status = next;
    emit();
  },
};

export function useLiveSettings() {
  return useSyncExternalStore(subscribe, liveStore.get, liveStore.get);
}

export function useLiveStatus() {
  return useSyncExternalStore(subscribe, liveStore.status, liveStore.status);
}
