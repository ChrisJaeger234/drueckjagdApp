import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServices } from '../../app/services';
import { useUser } from '../auth/AuthContext';
import { groupPermissions, type GroupRole } from './groupModel';

export const groupKeys = {
  all: (userId: string) => ['groups', userId] as const,
  one: (userId: string, groupId: string) => ['groups', userId, groupId] as const,
  members: (groupId: string) => ['group-members', groupId] as const,
  invites: (groupId: string) => ['group-invites', groupId] as const,
};

export function useMyGroups() {
  const { groups } = useServices();
  const user = useUser();
  return useQuery({ queryKey: groupKeys.all(user.id), queryFn: () => groups.myGroups(user.id) });
}

export function useMyGroup(groupId: string) {
  const { groups } = useServices();
  const user = useUser();
  const query = useQuery({ queryKey: groupKeys.one(user.id, groupId), queryFn: () => groups.myGroup(user.id, groupId) });
  const permissions = query.data ? groupPermissions(query.data.role, query.data.group.adminsCanManageMembers) : null;
  return { ...query, permissions };
}

export function useMembers(groupId: string) {
  const { groups } = useServices();
  return useQuery({ queryKey: groupKeys.members(groupId), queryFn: () => groups.members(groupId) });
}

export function useInvites(groupId: string, enabled: boolean) {
  const { groups } = useServices();
  return useQuery({ queryKey: groupKeys.invites(groupId), queryFn: () => groups.invites(groupId), enabled });
}

/** Mutationen einer Gruppe; danach werden die betroffenen Abfragen neu geladen. */
export function useGroupActions(groupId: string) {
  const { groups } = useServices();
  const user = useUser();
  const client = useQueryClient();
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['groups', user.id] }),
      client.invalidateQueries({ queryKey: groupKeys.members(groupId) }),
      client.invalidateQueries({ queryKey: groupKeys.invites(groupId) }),
    ]);
  return {
    update: useMutation({
      mutationFn: (input: { name: string; description: string; adminsCanManageMembers: boolean }) => groups.updateGroup(groupId, input),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: () => groups.deleteGroup(groupId), onSuccess: refresh }),
    leave: useMutation({ mutationFn: () => groups.leaveGroup(groupId), onSuccess: refresh }),
    setRole: useMutation({
      mutationFn: ({ userId, role }: { userId: string; role: GroupRole }) => groups.setMemberRole(groupId, userId, role),
      onSuccess: refresh,
    }),
    removeMember: useMutation({ mutationFn: (userId: string) => groups.removeMember(groupId, userId), onSuccess: refresh }),
    createInvite: useMutation({
      mutationFn: (options: { validHours: number | null; maxUses: number | null }) => groups.createInvite(groupId, options),
      onSuccess: refresh,
    }),
    revokeInvite: useMutation({ mutationFn: (inviteId: string) => groups.revokeInvite(inviteId), onSuccess: refresh }),
  };
}

export function useCreateGroup() {
  const { groups } = useServices();
  const user = useUser();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; description: string }) => groups.createGroup(input),
    onSuccess: () => client.invalidateQueries({ queryKey: groupKeys.all(user.id) }),
  });
}

export function useRedeemInvite() {
  const { groups } = useServices();
  const user = useUser();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => groups.redeemInvite(code),
    onSuccess: () => client.invalidateQueries({ queryKey: groupKeys.all(user.id) }),
  });
}
