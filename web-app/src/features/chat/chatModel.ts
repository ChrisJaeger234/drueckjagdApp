// Gruppenchat (Phase 9) auf der vorhandenen Tabelle messages (Migration 0002/0003/0012).

export interface ChatMessage {
  id: string;
  groupId: string;
  senderId: string | null;
  senderName: string | null;
  content: string;
  createdAt: string;
  /** Noch nicht beim Server angekommen (Funkloch). */
  pending?: boolean;
}

export const MESSAGE_COLUMNS = 'id, group_id, sender_id, content, created_at, sender:profiles!messages_sender_id_fkey(display_name, username)';

export interface MessageRow {
  id: string;
  group_id: string;
  sender_id: string | null;
  content: string;
  created_at: string;
  sender?: { display_name: string | null; username: string | null } | null;
}

export function messageFromRow(r: MessageRow): ChatMessage {
  const display = r.sender?.display_name?.trim();
  return {
    id: r.id,
    groupId: r.group_id,
    senderId: r.sender_id,
    senderName: display || (r.sender?.username ? `@${r.sender.username}` : null),
    content: r.content,
    createdAt: r.created_at,
  };
}

export const MAX_MESSAGE_LENGTH = 4000;
export const PAGE_SIZE = 200;

export interface MessageInput {
  id: string;
  content: string;
}

export const newMessage = (content: string): MessageInput => ({ id: crypto.randomUUID(), content: content.trim() });

/** Chronologisch aufsteigend; wartende Nachrichten am Ende. */
export const sortMessages = (list: ChatMessage[]) =>
  [...list].sort((a, b) => Number(!!a.pending) - Number(!!b.pending) || a.createdAt.localeCompare(b.createdAt));

export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, now)) return 'Heute';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return 'Gestern';
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
}

export const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
