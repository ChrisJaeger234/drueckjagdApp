import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, guard, unwrap } from '../../lib/errors';
import {
  INVITE_COLUMNS,
  MEMBER_COLUMNS,
  MEMBERSHIP_COLUMNS,
  groupFromRow,
  inviteFromRow,
  memberFromRow,
  parseRole,
  sortMembers,
  type CreatedInvite,
  type GroupInvite,
  type GroupMember,
  type GroupRole,
  type GroupRow,
  type HuntingGroup,
  type MyGroup,
} from './groupModel';

/** Port von GroupsRepository (Flutter). Schreibende Mitgliedschaftsänderungen laufen nur über RPCs. */
export interface GroupsService {
  myGroups(userId: string): Promise<MyGroup[]>;
  myGroup(userId: string, groupId: string): Promise<MyGroup>;
  createGroup(input: { name: string; description: string }): Promise<HuntingGroup>;
  updateGroup(groupId: string, input: { name: string; description: string; adminsCanManageMembers: boolean }): Promise<void>;
  deleteGroup(groupId: string): Promise<void>;
  members(groupId: string): Promise<GroupMember[]>;
  setMemberRole(groupId: string, userId: string, role: GroupRole): Promise<void>;
  removeMember(groupId: string, userId: string): Promise<void>;
  leaveGroup(groupId: string): Promise<void>;
  createInvite(groupId: string, options: { validHours: number | null; maxUses: number | null }): Promise<CreatedInvite>;
  invites(groupId: string): Promise<GroupInvite[]>;
  revokeInvite(inviteId: string): Promise<void>;
  /** Löst einen Code ein und liefert die Gruppen-ID. */
  redeemInvite(code: string): Promise<string>;
}

type MembershipRow = { role: string; group: GroupRow };

const toMyGroup = (row: MembershipRow): MyGroup => ({ group: groupFromRow(row.group), role: parseRole(row.role) });

/** RLS filtert unberechtigte Zeilen still heraus; das wird hier ausdrücklich gemeldet. */
function ensureAffected(rows: unknown[] | null) {
  if (!rows || rows.length === 0) throw new AppError('Dafür fehlen dir die Berechtigungen.', 'forbidden');
}

export function createSupabaseGroupsService(client: SupabaseClient): GroupsService {
  return {
    myGroups: (userId) =>
      guard(async () => {
        const rows = unwrap(await client.from('group_members').select(MEMBERSHIP_COLUMNS).eq('user_id', userId).returns<MembershipRow[]>());
        return rows.map(toMyGroup).sort((a, b) => a.group.name.localeCompare(b.group.name, 'de'));
      }),
    myGroup: (userId, groupId) =>
      guard(async () => {
        const row = unwrap(
          await client
            .from('group_members')
            .select(MEMBERSHIP_COLUMNS)
            .eq('user_id', userId)
            .eq('group_id', groupId)
            .maybeSingle<MembershipRow>(),
        );
        if (!row) throw new AppError('Diese Gruppe existiert nicht oder du bist kein Mitglied.', 'notFound');
        return toMyGroup(row);
      }),
    createGroup: ({ name, description }) =>
      guard(async () => {
        const row = unwrap(await client.rpc('create_group', { p_name: name.trim(), p_description: description.trim() }));
        return groupFromRow(row as GroupRow);
      }),
    updateGroup: (groupId, { name, description, adminsCanManageMembers }) =>
      guard(async () => {
        const rows = unwrap(
          await client
            .from('groups')
            .update({ name: name.trim(), description: description.trim(), admins_can_manage_members: adminsCanManageMembers })
            .eq('id', groupId)
            .select('id'),
        );
        ensureAffected(rows);
      }),
    deleteGroup: (groupId) =>
      guard(async () => {
        ensureAffected(unwrap(await client.from('groups').delete().eq('id', groupId).select('id')));
      }),
    members: (groupId) =>
      guard(async () => {
        const rows = unwrap(await client.from('group_members').select(MEMBER_COLUMNS).eq('group_id', groupId).returns<Parameters<typeof memberFromRow>[0][]>());
        return sortMembers(rows.map(memberFromRow));
      }),
    setMemberRole: (groupId, userId, role) =>
      guard(async () => {
        unwrap(await client.rpc('set_group_member_role', { p_group_id: groupId, p_user_id: userId, p_role: role }));
      }),
    removeMember: (groupId, userId) =>
      guard(async () => {
        unwrap(await client.rpc('remove_group_member', { p_group_id: groupId, p_user_id: userId }));
      }),
    leaveGroup: (groupId) =>
      guard(async () => {
        unwrap(await client.rpc('leave_group', { p_group_id: groupId }));
      }),
    createInvite: (groupId, { validHours, maxUses }) =>
      guard(async () => {
        const rows = unwrap(
          await client.rpc('create_group_invite', { p_group_id: groupId, p_valid_hours: validHours, p_max_uses: maxUses }),
        ) as { invite_id: string; code: string; expires_at: string | null }[];
        const first = rows[0];
        if (!first) throw new AppError('Der Einladungscode konnte nicht erzeugt werden.');
        return { inviteId: first.invite_id, code: first.code, expiresAt: first.expires_at };
      }),
    invites: (groupId) =>
      guard(async () => {
        const rows = unwrap(
          await client
            .from('group_invites')
            .select(INVITE_COLUMNS)
            .eq('group_id', groupId)
            .order('created_at', { ascending: false })
            .returns<Parameters<typeof inviteFromRow>[0][]>(),
        );
        return rows.map(inviteFromRow);
      }),
    revokeInvite: (inviteId) =>
      guard(async () => {
        unwrap(await client.rpc('revoke_group_invite', { p_invite_id: inviteId }));
      }),
    redeemInvite: (code) =>
      guard(async () => {
        const groupId = unwrap(await client.rpc('redeem_group_invite', { p_code: code })) as string | null;
        if (!groupId) throw new AppError('Dieser Einladungscode ist ungültig, abgelaufen oder wurde bereits verwendet.', 'validation');
        return groupId;
      }),
  };
}

