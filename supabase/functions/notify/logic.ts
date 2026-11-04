// Reine Logik der Edge Function „notify“ (ohne Deno- oder Netz-APIs), damit sie mit Vitest
// getestet werden kann (web-app/src/features/push/notifyLogic.test.ts).

export type NotifyRequest = { type: 'message'; id: string } | { type: 'report'; id: string } | { type: 'config' };

export interface PushPayload {
  title: string;
  body: string;
  /** Pfad innerhalb der App, z. B. „chat/<id>“ (ohne führenden Schrägstrich). */
  url: string;
  /** Gleiche Kennung ersetzt eine ältere Benachrichtigung statt sie zu stapeln. */
  tag: string;
}

export function parseRequest(body: unknown): NotifyRequest | null {
  if (!body || typeof body !== 'object') return null;
  const { type, id } = body as Record<string, unknown>;
  if (type === 'config') return { type };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if ((type !== 'message' && type !== 'report') || typeof id !== 'string' || !uuid.test(id)) return null;
  return { type, id };
}

/** Nur bekannte Push-Dienste anschreiben (kein Weiterleiten an beliebige Adressen). */
const PUSH_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];

export function isAllowedEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** Nachrichten älter als ein Tag lösen keine Benachrichtigung mehr aus (z. B. späte Wiederholung). */
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const isFresh = (createdAt: string, now = Date.now()) => now - new Date(createdAt).getTime() <= MAX_AGE_MS;

export const displayName = (p: { display_name?: string | null; username?: string | null } | null | undefined) =>
  p?.display_name?.trim() || (p?.username ? `@${p.username}` : 'Jemand');

const shorten = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function messagePayload(m: { id: string; group_id: string; content: string }, groupName: string, sender: string): PushPayload {
  return { title: groupName, body: shorten(`${sender}: ${m.content.replace(/\s+/g, ' ').trim()}`, 160), url: `chat/${m.group_id}`, tag: `chat-${m.group_id}` };
}

/** Rollen, die bei „angeschossen“ benachrichtigt werden: Jagdleitung, Hundeführer, Bergung. */
export const REPORT_ROLES = ['jagdleiter', 'ansteller', 'hundefuehrer', 'bergung'] as const;

export function reportPayload(
  r: { id: string; hunt_id: string; species: string; count: number },
  huntTitle: string,
  stand: string | null,
  reporter: string,
): PushPayload {
  const what = `${r.count > 1 ? `${r.count}× ` : ''}${r.species || 'Wild'}`;
  return {
    title: `Nachsuche: angeschossen (${huntTitle})`,
    body: [what, stand, reporter].filter(Boolean).join(' · '),
    url: `jagd/${r.hunt_id}`,
    tag: `report-${r.id}`,
  };
}

/** Empfänger ohne den Auslöser, jeder nur einmal. */
export const recipients = (userIds: (string | null | undefined)[], exclude: string) => [...new Set(userIds.filter((u): u is string => !!u && u !== exclude))];
