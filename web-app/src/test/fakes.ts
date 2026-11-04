import { AppError } from '../lib/errors';
import type { AppUser, AuthEvent, AuthService, SignUpResult } from '../features/auth/authService';
import type { Profile, ProfileService } from '../features/profile/profileService';
import { inviteStatus, type GroupInvite, type GroupMember, type GroupRole, type HuntingGroup, type MyGroup } from '../features/groups/groupModel';
import type { GroupsService } from '../features/groups/groupsService';

/** In-Memory-Auth für Tests (wie FakeAuthRepository in der Flutter-App). */
export class FakeAuth implements AuthService {
  user: AppUser | null;
  passwords = new Map<string, string>();
  confirmationRequired = false;
  unconfirmed = new Set<string>();
  calls: string[] = [];
  private listeners = new Set<(u: AppUser | null, e: AuthEvent) => void>();

  constructor(user: AppUser | null = null) {
    this.user = user;
  }

  private emit(event: AuthEvent) {
    this.listeners.forEach((l) => l(this.user, event));
  }

  async currentUser() {
    return this.user;
  }
  onChange(listener: (u: AppUser | null, e: AuthEvent) => void) {
    this.listeners.add(listener);
    queueMicrotask(() => listener(this.user, 'initial'));
    return () => this.listeners.delete(listener);
  }
  async signUp({ email, password }: { email: string; password: string }): Promise<SignUpResult> {
    this.calls.push(`signUp:${email}`);
    if (this.passwords.has(email)) throw new AppError('Für diese E-Mail-Adresse existiert bereits ein Konto.', 'emailAlreadyRegistered');
    this.passwords.set(email, password);
    if (this.confirmationRequired) {
      this.unconfirmed.add(email);
      return 'confirmationRequired';
    }
    this.user = { id: `u-${email}`, email, emailConfirmed: true };
    this.emit('signedIn');
    return 'signedIn';
  }
  async signIn({ email, password }: { email: string; password: string }) {
    this.calls.push(`signIn:${email}`);
    if (this.passwords.get(email) !== password) throw new AppError('E-Mail-Adresse oder Passwort ist falsch.', 'invalidCredentials');
    if (this.unconfirmed.has(email)) {
      throw new AppError('Bitte bestätige zuerst deine E-Mail-Adresse über den Link in der Bestätigungs-Mail.', 'emailNotConfirmed');
    }
    this.user = { id: `u-${email}`, email, emailConfirmed: true };
    this.emit('signedIn');
  }
  async signOut() {
    this.calls.push('signOut');
    this.user = null;
    this.emit('signedOut');
  }
  async resendConfirmation(email: string) {
    this.calls.push(`resend:${email}`);
  }
  async requestPasswordReset(email: string) {
    this.calls.push(`reset:${email}`);
  }
  async updatePassword(password: string) {
    this.calls.push('updatePassword');
    if (this.user?.email) this.passwords.set(this.user.email, password);
  }
  /** Simuliert das Öffnen des Links aus der Passwort-Mail. */
  openRecoveryLink(email: string) {
    this.user = { id: `u-${email}`, email, emailConfirmed: true };
    this.emit('passwordRecovery');
  }
}

export class FakeProfiles implements ProfileService {
  profiles = new Map<string, Profile>();
  takenUsernames = new Set<string>();

  seed(id: string, data: Partial<Profile> = {}) {
    this.profiles.set(id, { id, username: null, displayName: '', avatarPath: null, createdAt: '2026-11-04T00:00:00Z', updatedAt: '2026-11-04T00:00:00Z', ...data });
  }
  async fetch(userId: string) {
    const p = this.profiles.get(userId);
    if (!p) {
      this.seed(userId);
      return this.profiles.get(userId)!;
    }
    return p;
  }
  async update(userId: string, { username, displayName }: { username: string; displayName: string }) {
    if (this.takenUsernames.has(username)) throw new AppError('Dieser Benutzername ist bereits vergeben.', 'conflict');
    const next = { ...(await this.fetch(userId)), username, displayName };
    this.profiles.set(userId, next);
    return next;
  }
  async uploadAvatar(userId: string) {
    const next = { ...(await this.fetch(userId)), avatarPath: `${userId}/avatar.jpg` };
    this.profiles.set(userId, next);
    return next;
  }
  async avatarUrl() {
    return null;
  }
}

/** In-Memory-Gruppen mit denselben Regeln wie die SQL-Funktionen (vereinfacht). */
export class FakeGroups implements GroupsService {
  groups = new Map<string, HuntingGroup>();
  memberList: GroupMember[] = [];
  inviteList: (GroupInvite & { code: string })[] = [];
  private seq = 0;
  constructor(private auth: FakeAuth, private profiles: FakeProfiles) {}

  private uid() {
    if (!this.auth.user) throw new AppError('Bitte melde dich an.', 'unauthenticated');
    return this.auth.user.id;
  }
  private roleOf(groupId: string, userId = this.uid()) {
    return this.memberList.find((m) => m.groupId === groupId && m.userId === userId)?.role ?? null;
  }
  private requireRole(groupId: string, ...roles: GroupRole[]) {
    const role = this.roleOf(groupId);
    if (!role || !roles.includes(role)) throw new AppError('Dafür fehlen dir die Berechtigungen in dieser Gruppe.', 'forbidden');
    return role;
  }
  private canManage(groupId: string) {
    const g = this.groups.get(groupId);
    return this.requireRole(groupId, ...(g?.adminsCanManageMembers ? (['owner', 'admin'] as const) : (['owner'] as const)));
  }

  seedGroup(name: string, members: [string, GroupRole][], data: Partial<HuntingGroup> = {}) {
    const id = `g${++this.seq}`;
    this.groups.set(id, { id, name, description: '', createdBy: members[0]?.[0] ?? null, adminsCanManageMembers: true, createdAt: '', updatedAt: '', ...data });
    members.forEach(([userId, role]) => this.addMember(id, userId, role));
    return id;
  }
  private addMember(groupId: string, userId: string, role: GroupRole) {
    this.memberList.push({ id: `m${++this.seq}`, groupId, userId, role, joinedAt: '', profile: this.profiles.profiles.get(userId) ?? null });
  }

  async myGroups(userId: string): Promise<MyGroup[]> {
    return this.memberList.filter((m) => m.userId === userId).map((m) => ({ group: this.groups.get(m.groupId)!, role: m.role }));
  }
  async myGroup(userId: string, groupId: string) {
    const found = (await this.myGroups(userId)).find((g) => g.group.id === groupId);
    if (!found) throw new AppError('Diese Gruppe existiert nicht oder du bist kein Mitglied.', 'notFound');
    return found;
  }
  async createGroup({ name, description }: { name: string; description: string }) {
    const id = this.seedGroup(name, [[this.uid(), 'owner']], { description });
    return this.groups.get(id)!;
  }
  async updateGroup(groupId: string, input: { name: string; description: string; adminsCanManageMembers: boolean }) {
    this.requireRole(groupId, 'owner');
    this.groups.set(groupId, { ...this.groups.get(groupId)!, ...input });
  }
  async deleteGroup(groupId: string) {
    this.requireRole(groupId, 'owner');
    this.groups.delete(groupId);
    this.memberList = this.memberList.filter((m) => m.groupId !== groupId);
  }
  async members(groupId: string) {
    return this.memberList.filter((m) => m.groupId === groupId);
  }
  async setMemberRole(groupId: string, userId: string, role: GroupRole) {
    this.requireRole(groupId, 'owner');
    const m = this.memberList.find((x) => x.groupId === groupId && x.userId === userId);
    if (!m) throw new AppError('Dieses Mitglied wurde nicht gefunden.', 'notFound');
    m.role = role;
  }
  async removeMember(groupId: string, userId: string) {
    this.canManage(groupId);
    this.memberList = this.memberList.filter((m) => !(m.groupId === groupId && m.userId === userId));
  }
  async leaveGroup(groupId: string) {
    const uid = this.uid();
    const owners = this.memberList.filter((m) => m.groupId === groupId && m.role === 'owner');
    if (this.roleOf(groupId) === 'owner' && owners.length === 1) {
      throw new AppError('Du bist der einzige Owner. Ernenne zuerst ein anderes Mitglied zum Owner oder lösche die Gruppe.', 'conflict');
    }
    this.memberList = this.memberList.filter((m) => !(m.groupId === groupId && m.userId === uid));
  }
  async createInvite(groupId: string, { validHours, maxUses }: { validHours: number | null; maxUses: number | null }) {
    this.canManage(groupId);
    const code = `ABCD-EFGH-${String(++this.seq).padStart(4, 'K')}`;
    const expiresAt = validHours ? new Date(Date.now() + validHours * 3600_000).toISOString() : null;
    const id = `i${this.seq}`;
    this.inviteList.unshift({ id, groupId, createdBy: this.uid(), createdAt: new Date().toISOString(), expiresAt, maxUses, useCount: 0, revokedAt: null, code });
    return { inviteId: id, code, expiresAt };
  }
  async invites(groupId: string) {
    return this.inviteList.filter((i) => i.groupId === groupId);
  }
  async revokeInvite(inviteId: string) {
    const inv = this.inviteList.find((i) => i.id === inviteId);
    if (inv) inv.revokedAt = new Date().toISOString();
  }
  async redeemInvite(code: string) {
    const inv = this.inviteList.find((i) => i.code === code && inviteStatus(i) === 'active');
    if (!inv) throw new AppError('Dieser Einladungscode ist ungültig, abgelaufen oder wurde bereits verwendet.', 'validation');
    inv.useCount++;
    if (!this.roleOf(inv.groupId)) this.addMember(inv.groupId, this.uid(), 'member');
    return inv.groupId;
  }
}
