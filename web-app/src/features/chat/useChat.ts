import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useServices } from '../../app/services';
import { chatKey, MESSAGE_MUTATION_KEY, type MessageVariables } from '../../lib/offline';

/** Nachrichten einer Gruppe; neue kommen per Echtzeit, sonst spätestens alle 30 s. */
export function useChatMessages(groupId: string) {
  const { chat } = useServices();
  const client = useQueryClient();
  useEffect(() => chat.subscribe(groupId, () => void client.invalidateQueries({ queryKey: chatKey(groupId) })), [chat, client, groupId]);
  return useQuery({ queryKey: chatKey(groupId), queryFn: () => chat.messages(groupId), refetchInterval: 30_000 });
}

/** Senden über die Warteschlange (lib/offline.ts): ohne Netz wird später gesendet. */
export function useSendMessage() {
  return useMutation<void, Error, MessageVariables>({ mutationKey: MESSAGE_MUTATION_KEY });
}

export function useDeleteMessage(groupId: string) {
  const { chat } = useServices();
  const client = useQueryClient();
  return useMutation({ mutationFn: (id: string) => chat.remove(id), onSettled: () => client.invalidateQueries({ queryKey: chatKey(groupId) }) });
}
