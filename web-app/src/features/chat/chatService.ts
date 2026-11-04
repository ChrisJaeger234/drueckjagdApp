import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, guard, unwrap } from '../../lib/errors';
import { MESSAGE_COLUMNS, messageFromRow, PAGE_SIZE, type ChatMessage, type MessageInput, type MessageRow } from './chatModel';

export interface ChatService {
  /** Die letzten Nachrichten der Gruppe, älteste zuerst. */
  messages(groupId: string): Promise<ChatMessage[]>;
  /** Idempotent: eine schon angekommene Nachricht (gleiche ID) ist kein Fehler. */
  send(groupId: string, input: MessageInput): Promise<void>;
  remove(messageId: string): Promise<void>;
  /** Meldet neue und gelöschte Nachrichten in Echtzeit; gibt die Abmeldung zurück. */
  subscribe(groupId: string, onChange: () => void): () => void;
}

export function createSupabaseChatService(client: SupabaseClient): ChatService {
  return {
    messages: (groupId) =>
      guard(async () =>
        unwrap(
          await client.from('messages').select(MESSAGE_COLUMNS).eq('group_id', groupId).order('created_at', { ascending: false }).limit(PAGE_SIZE).returns<MessageRow[]>(),
        )
          .map(messageFromRow)
          .reverse(),
      ),
    send: (groupId, m) =>
      guard(async () => {
        const { error } = await client.from('messages').insert({ id: m.id, group_id: groupId, content: m.content });
        if (error && !(error.code === '23505' && error.message.includes('messages_pkey'))) throw error;
      }),
    remove: (messageId) =>
      guard(async () => {
        const rows = unwrap(await client.from('messages').delete().eq('id', messageId).select('id'));
        if (rows.length === 0) throw new AppError('Dafür fehlen dir die Berechtigungen.', 'forbidden');
      }),
    subscribe: (groupId, onChange) => {
      const channel = client
        .channel(`chat:${groupId}:${crypto.randomUUID()}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${groupId}` }, onChange)
        // Löschungen kommen ohne Gruppenbezug (nur die ID); ein Neuladen ist billig.
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, onChange)
        .subscribe();
      return () => void client.removeChannel(channel);
    },
  };
}
