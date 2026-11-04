import { profileFromRow, profileLabel, PROFILE_COLUMNS, type Profile } from '../profile/profileService';

// Port von lib/features/groups/domain/*.dart

export type GroupRole = 'owner' | 'admin' | 'member';

export const GROUP_ROLES: Record<GroupRole, { label: string; description: string; order: number }> = {
  owner: { label: 'Owner', description: 'Verwaltet Gruppe, Mitglieder, Rollen und Reviere', order: 0 },
  admin: { label: 'Admin', description: 'Bearbeitet Reviere und verwaltet Mitglieder, sofern erlaubt', order: 1 },
  member: { label: 'Mitglied', description: 'Sieht Gruppe, Reviere und Wegpunkte', order: 2 },
};

export function parseRole(value: string): GroupRole {
  if (value === 'owner' || value === 'admin' || value === 'member') return value;
  throw new Error(`Unbekannte Rolle: ${value}`);
}

export interface HuntingGroup {
  id: string;
  name: string;
  description: string;
  createdBy: string | null;
  adminsCanManageMembers: boolean;
  createdAt: string;
  updatedAt: string;
}

export const GROUP_COLUMNS = 'id, name, description, created_by, admins_can_manage_members, created_at, updated_at';

export interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  admins_can_manage_members: boolean | null;
  created_at: string;
  updated_at: string;
}

export function groupFromRow(row: GroupRow): HuntingGroup {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    createdBy: row.created_by,
    adminsCanManageMembers: row.admins_can_manage_members ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Eine Gruppe aus Sicht des angemeldeten Benutzers (inkl. eigener Rolle). */
export interface MyGroup {
  group: HuntingGroup;
  role: GroupRole;
}

export const MEMBERSHIP_COLUMNS = `role, group:groups!inner(${GROUP_COLUMNS})`;

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  role: GroupRole;
  joinedAt: string;
  profile: Profile | null;
}

export const MEMBER_COLUMNS = `id, group_id, user_id, role, joined_at, profile:profiles(${PROFILE_COLUMNS})`;

export function memberFromRow(row: {
  id: string;
  group_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profile: Parameters<typeof profileFromRow>[0] | null;
}): GroupMember {
  return {
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    role: parseRole(row.role),
    joinedAt: row.joined_at,
    profile: row.profile ? profileFromRow(row.profile) : null,
  };
}

export function memberLabel(m: GroupMember): string {
  return m.profile ? profileLabel(m.profile) : 'Unbekanntes Mitglied';
}

/** Owner zuerst, dann Admins, dann Mitglieder; innerhalb alphabetisch. */
export function sortMembers(members: GroupMember[]): GroupMember[] {
  return [...members].sort(
    (a, b) => GROUP_ROLES[a.role].order - GROUP_ROLES[b.role].order || memberLabel(a).localeCompare(memberLabel(b), 'de'),
  );
}

/**
 * Berechtigungen eines Mitglieds, spiegelt die Regeln aus RLS und SQL-Funktionen nur für die
 * Darstellung. Durchgesetzt wird ausschließlich in der Datenbank.
 */
export function groupPermissions(role: GroupRole, adminsCanManageMembers: boolean) {
  const isOwner = role === 'owner';
  const canManageMembers = isOwner || (role === 'admin' && adminsCanManageMembers);
  return {
    isOwner,
    canEditGroup: isOwner,
    canDeleteGroup: isOwner,
    canManageMembers,
    canInvite: canManageMembers,
    canAssignRoles: isOwner,
    canCreateRevier: role === 'owner' || role === 'admin',
    canEditRevier: role === 'owner' || role === 'admin',
    canDeleteRevier: isOwner,
    /** Darf ein Mitglied mit Rolle `target` entfernt werden? */
    canRemove(target: GroupRole, isSelf: boolean): boolean {
      if (isSelf) return false;
      if (isOwner) return true;
      return canManageMembers && target === 'member';
    },
  };
}

export type GroupPermissions = ReturnType<typeof groupPermissions>;

// ---------------------------------------------------------------- Einladungen

export interface GroupInvite {
  id: string;
  groupId: string;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  revokedAt: string | null;
}

/** Der Code-Hash ist für Clients nicht lesbar und wird nie abgefragt. */
export const INVITE_COLUMNS = 'id, group_id, created_by, created_at, expires_at, max_uses, use_count, revoked_at';

export function inviteFromRow(row: {
  id: string;
  group_id: string;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number | null;
  revoked_at: string | null;
}): GroupInvite {
  return {
    id: row.id,
    groupId: row.group_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    useCount: row.use_count ?? 0,
    revokedAt: row.revoked_at,
  };
}

export type InviteStatus = 'active' | 'expired' | 'exhausted' | 'revoked';
export const INVITE_STATUS_LABEL: Record<InviteStatus, string> = {
  active: 'Aktiv',
  expired: 'Abgelaufen',
  exhausted: 'Aufgebraucht',
  revoked: 'Widerrufen',
};

export function inviteStatus(invite: GroupInvite, now: Date = new Date()): InviteStatus {
  if (invite.revokedAt) return 'revoked';
  if (invite.expiresAt && new Date(invite.expiresAt) <= now) return 'expired';
  if (invite.maxUses != null && invite.useCount >= invite.maxUses) return 'exhausted';
  return 'active';
}

/** Frisch erzeugte Einladung; der Klartext-Code ist nur jetzt verfügbar. */
export interface CreatedInvite {
  inviteId: string;
  code: string;
  expiresAt: string | null;
}

/** Code in Vierergruppen zur besseren Lesbarkeit, z. B. ABCD-EFGH-JKMN. */
export function formatInviteCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}
