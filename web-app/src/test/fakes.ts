import { AppError } from '../lib/errors';
import type { AppUser, AuthEvent, AuthService, SignUpResult } from '../features/auth/authService';
import type { Profile, ProfileService } from '../features/profile/profileService';
import { inviteStatus, type GroupInvite, type GroupMember, type GroupRole, type HuntingGroup, type MyGroup } from '../features/groups/groupModel';
import type { GroupsService } from '../features/groups/groupsService';
import type { Boundary, Revier, RevierBoundary, Waypoint, WaypointInput } from '../features/reviere/revierModel';
import type { ReviereService } from '../features/reviere/reviereService';
import {
  canSelfJoinHunt,
  isLeadRole,
  livePermissions,
  type LivePosition,
  sortHunts,
  sortParticipants,
  sortStands,
  type Hunt,
  type HuntDraft,
  type HuntRole,
  type HuntStatus,
  type Participant,
  type Report,
  type ReportInput,
  type Stand,
  type StandInput,
  type Zone,
  type ZoneKind,
} from '../features/hunts/huntModel';
import type { HuntsService } from '../features/hunts/huntsService';
import { sortMessages, type ChatMessage, type MessageInput } from '../features/chat/chatModel';
import type { ChatService } from '../features/chat/chatService';

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

/** In-Memory-Reviere; Rechte wie RLS: Owner/Admin schreiben, Owner löscht Reviere. */
export class FakeReviere implements ReviereService {
  reviere: Revier[] = [];
  boundaryList: RevierBoundary[] = [];
  waypointList: Waypoint[] = [];
  private seq = 0;
  constructor(private auth: FakeAuth, private groups: FakeGroups) {}

  private role(groupId: string) {
    return this.groups.memberList.find((m) => m.groupId === groupId && m.userId === this.auth.user?.id)?.role ?? null;
  }
  private requireEditor(revierId: string) {
    const r = this.reviere.find((x) => x.id === revierId);
    const role = r ? this.role(r.groupId) : null;
    if (role !== 'owner' && role !== 'admin') throw new AppError('Dafür fehlen dir die Berechtigungen.', 'forbidden');
    return r!;
  }
  private visible() {
    return this.reviere.filter((r) => this.role(r.groupId));
  }

  seedRevier(groupId: string, name: string) {
    const r: Revier = { id: `r${++this.seq}`, name, description: '', groupId, groupName: this.groups.groups.get(groupId)?.name ?? null, createdBy: null, createdAt: '', updatedAt: '' };
    this.reviere.push(r);
    return r.id;
  }
  seedWaypoint(revierId: string, data: Partial<Waypoint> = {}) {
    const w: Waypoint = { id: `w${++this.seq}`, revierId, createdBy: null, name: 'Bock 1', description: '', category: 'drueckjagdbock', lat: 51.17, lng: 7.25, ...data };
    this.waypointList.push(w);
    return w.id;
  }

  async all() {
    return this.visible();
  }
  async forGroup(groupId: string) {
    return this.visible().filter((r) => r.groupId === groupId);
  }
  async get(revierId: string) {
    const r = this.visible().find((x) => x.id === revierId);
    if (!r) throw new AppError('Dieses Revier existiert nicht oder du hast keinen Zugriff.', 'notFound');
    return r;
  }
  async create({ groupId, name, description }: { groupId: string; name: string; description: string }) {
    const role = this.role(groupId);
    if (role !== 'owner' && role !== 'admin') throw new AppError('Dafür fehlen dir die Berechtigungen.', 'forbidden');
    const id = this.seedRevier(groupId, name.trim());
    const r = this.reviere.find((x) => x.id === id)!;
    r.description = description;
    return r;
  }
  async update(revierId: string, input: { name: string; description: string }) {
    Object.assign(this.requireEditor(revierId), input);
  }
  async remove(revierId: string) {
    const r = this.requireEditor(revierId);
    if (this.role(r.groupId) !== 'owner') throw new AppError('Dafür fehlen dir die Berechtigungen.', 'forbidden');
    this.reviere = this.reviere.filter((x) => x.id !== revierId);
  }
  async boundaries(revierIds: string[]) {
    return this.boundaryList.filter((b) => revierIds.includes(b.revierId));
  }
  async saveBoundary(revierId: string, geometry: Boundary) {
    this.requireEditor(revierId);
    this.boundaryList = [...this.boundaryList.filter((b) => b.revierId !== revierId), { id: `b${++this.seq}`, revierId, geometry }];
  }
  async removeBoundary(revierId: string) {
    this.requireEditor(revierId);
    this.boundaryList = this.boundaryList.filter((b) => b.revierId !== revierId);
  }
  async waypoints(revierIds: string[]) {
    return this.waypointList.filter((w) => revierIds.includes(w.revierId));
  }
  async createWaypoint(revierId: string, input: WaypointInput) {
    this.requireEditor(revierId);
    const id = this.seedWaypoint(revierId, { ...input, createdBy: this.auth.user!.id });
    return this.waypointList.find((w) => w.id === id)!;
  }
  async updateWaypoint(waypointId: string, input: WaypointInput) {
    const w = this.waypointList.find((x) => x.id === waypointId);
    if (!w) throw new AppError('Der Eintrag wurde nicht gefunden.', 'notFound');
    Object.assign(w, input);
  }
  async removeWaypoint(waypointId: string) {
    this.waypointList = this.waypointList.filter((w) => w.id !== waypointId);
  }
}

/** In-Memory-Jagden mit den wichtigsten Regeln aus Migration 0010. */
/** Kopien wie bei echten Serverantworten, damit Änderungen im Fake nicht den Abfrage-Cache verändern. */
const clone = <T,>(v: T): T => structuredClone(v);

export class FakeHunts implements HuntsService {
  hunts: Hunt[] = [];
  participantList: Participant[] = [];
  standList: Stand[] = [];
  zoneList: Zone[] = [];
  reportList: Report[] = [];
  /** Live-Positionen je `${huntId}:${userId}`. */
  positionMap = new Map<string, LivePosition & { huntId: string }>();
  private seq = 0;
  constructor(private auth: FakeAuth, private groups: FakeGroups, private profiles: FakeProfiles) {}

  private uid() {
    return this.auth.user!.id;
  }
  private groupRole(huntId: string) {
    const h = this.hunts.find((x) => x.id === huntId);
    return this.groups.memberList.find((m) => m.groupId === h?.groupId && m.userId === this.uid())?.role ?? null;
  }
  private canManage(huntId: string) {
    const role = this.groupRole(huntId);
    const me = this.participantList.find((p) => p.huntId === huntId && p.userId === this.uid());
    return role === 'owner' || role === 'admin' || (me != null && isLeadRole(me.role));
  }
  private requireManage(huntId: string) {
    if (!this.canManage(huntId)) throw new AppError('Dafür fehlen dir die Berechtigungen.', 'forbidden');
  }
  private name(userId: string) {
    const p = this.profiles.profiles.get(userId);
    return p?.displayName || (p?.username ? `@${p.username}` : 'Unbekannt');
  }

  seedHunt(groupId: string, data: Partial<Hunt> = {}) {
    const h: Hunt = {
      id: `h${++this.seq}`, groupId, groupName: this.groups.groups.get(groupId)?.name ?? null, revierId: null, revierName: null,
      title: 'Drückjagd', description: '', startsAt: '2026-11-21T07:00:00.000Z', endsAt: null, status: 'geplant', meetingPoint: '',
      meetingLat: null, meetingLng: null, gameRelease: '', safetyNotes: '', emergencyInfo: '', selfJoin: true, createdBy: null, ...data,
    };
    this.hunts.push(h);
    return h.id;
  }
  seedParticipant(huntId: string, userId: string, role: HuntRole, standId: string | null = null) {
    this.participantList.push({ id: `p${++this.seq}`, huntId, userId, role, standId, zoneId: null, note: '', name: this.name(userId) });
  }
  seedStand(huntId: string, label: string) {
    const s: Stand = { id: `s${++this.seq}`, huntId, label, waypointId: null, zoneId: null, lat: 51.17, lng: 7.25, description: '', sortOrder: 0 };
    this.standList.push(s);
    return s.id;
  }

  async all() {
    return clone(sortHunts(this.hunts.filter((h) => this.groups.memberList.some((m) => m.groupId === h.groupId && m.userId === this.uid()))));
  }
  async forGroup(groupId: string) {
    return (await this.all()).filter((h) => h.groupId === groupId);
  }
  async get(huntId: string) {
    const h = (await this.all()).find((x) => x.id === huntId);
    if (!h) throw new AppError('Diese Jagd existiert nicht oder du hast keinen Zugriff.', 'notFound');
    return h;
  }
  async create(groupId: string, d: HuntDraft) {
    const role = this.groups.memberList.find((m) => m.groupId === groupId && m.userId === this.uid())?.role;
    if (role !== 'owner' && role !== 'admin') throw new AppError('Dafür fehlen dir die Berechtigungen.', 'forbidden');
    const id = this.seedHunt(groupId, { ...d, startsAt: new Date(d.startsAt).toISOString(), endsAt: d.endsAt ? new Date(d.endsAt).toISOString() : null, createdBy: this.uid() });
    this.seedParticipant(id, this.uid(), 'jagdleiter');
    return this.hunts.find((h) => h.id === id)!;
  }
  async update(huntId: string, d: HuntDraft) {
    this.requireManage(huntId);
    Object.assign(this.hunts.find((h) => h.id === huntId)!, { ...d, startsAt: new Date(d.startsAt).toISOString() });
  }
  async setStatus(huntId: string, status: HuntStatus) {
    this.requireManage(huntId);
    this.hunts.find((h) => h.id === huntId)!.status = status;
    if (status !== 'laufend') for (const k of [...this.positionMap.keys()]) if (k.startsWith(`${huntId}:`)) this.positionMap.delete(k);
  }
  async remove(huntId: string) {
    const role = this.groupRole(huntId);
    if (role !== 'owner' && role !== 'admin') throw new AppError('Dafür fehlen dir die Berechtigungen.', 'forbidden');
    this.hunts = this.hunts.filter((h) => h.id !== huntId);
  }
  async participants(huntId: string) {
    return clone(sortParticipants(this.participantList.filter((p) => p.huntId === huntId)));
  }
  async join(huntId: string, role: HuntRole) {
    const h = this.hunts.find((x) => x.id === huntId)!;
    if (isLeadRole(role) || !canSelfJoinHunt(h)) throw new AppError('Dafür fehlen dir die Berechtigungen in dieser Gruppe.', 'forbidden');
    this.seedParticipant(huntId, this.uid(), role);
  }
  async addParticipant(huntId: string, userId: string, role: HuntRole) {
    this.requireManage(huntId);
    this.seedParticipant(huntId, userId, role);
  }
  async updateParticipant(id: string, patch: { role?: HuntRole; note?: string; standId?: string | null; zoneId?: string | null }) {
    const p = this.participantList.find((x) => x.id === id)!;
    const manage = this.canManage(p.huntId);
    if (!manage && (p.userId !== this.uid() || patch.standId !== undefined || patch.zoneId !== undefined || (patch.role && isLeadRole(patch.role)))) {
      throw new AppError('Dafür fehlen dir die Berechtigungen in dieser Gruppe.', 'forbidden');
    }
    if (patch.role !== undefined) p.role = patch.role;
    if (patch.note !== undefined) p.note = patch.note;
    if (patch.standId !== undefined) p.standId = patch.standId;
    if (patch.zoneId !== undefined) p.zoneId = patch.zoneId;
  }
  async removeParticipant(id: string) {
    const p = this.participantList.find((x) => x.id === id)!;
    if (p.userId !== this.uid()) this.requireManage(p.huntId);
    this.participantList = this.participantList.filter((x) => x.id !== id);
  }
  async zones(huntId: string) {
    return clone(this.zoneList.filter((z) => z.huntId === huntId));
  }
  async createZone(huntId: string, { name, kind, geometry }: { name: string; kind: ZoneKind; geometry: Boundary }) {
    this.requireManage(huntId);
    this.zoneList.push({ id: `z${++this.seq}`, huntId, name, kind, description: '', color: null, geometry });
  }
  async removeZone(zoneId: string) {
    this.zoneList = this.zoneList.filter((z) => z.id !== zoneId);
  }
  async stands(huntId: string) {
    return clone(sortStands(this.standList.filter((s) => s.huntId === huntId)));
  }
  async createStand(huntId: string, input: StandInput) {
    this.requireManage(huntId);
    if (this.standList.some((s) => s.huntId === huntId && s.label.toLowerCase() === input.label.trim().toLowerCase())) {
      throw new AppError('In dieser Jagd gibt es bereits einen Stand mit dieser Bezeichnung.', 'conflict');
    }
    const id = this.seedStand(huntId, input.label.trim());
    return Object.assign(this.standList.find((s) => s.id === id)!, { lat: input.lat, lng: input.lng });
  }
  async updateStand(standId: string, input: StandInput) {
    Object.assign(this.standList.find((s) => s.id === standId)!, input);
  }
  async removeStand(standId: string) {
    this.standList = this.standList.filter((s) => s.id !== standId);
    this.participantList.forEach((p) => p.standId === standId && (p.standId = null));
  }
  async reports(huntId: string) {
    return clone(this.reportList.filter((r) => r.huntId === huntId));
  }
  async createReport(huntId: string, r: ReportInput) {
    if (this.reportList.some((x) => x.id === r.id)) return;
    this.reportList.unshift({ huntId, reporterId: this.uid(), reporterName: this.name(this.uid()), resolvedAt: null, ...r });
  }
  async setReportResolved(reportId: string, resolved: boolean) {
    this.reportList.find((r) => r.id === reportId)!.resolvedAt = resolved ? new Date().toISOString() : null;
  }
  async removeReport(reportId: string) {
    this.reportList = this.reportList.filter((r) => r.id !== reportId);
  }
  // Live-Standorte: gleiche Regeln wie Migration 0011.
  private live(huntId: string) {
    const h = this.hunts.find((x) => x.id === huntId)!;
    const me = this.participantList.find((p) => p.huntId === huntId && p.userId === this.uid()) ?? null;
    return livePermissions(h, this.groupRole(huntId), me);
  }
  seedPosition(huntId: string, userId: string, lat = 51.17, lng = 7.25, updatedAt = new Date().toISOString()) {
    this.positionMap.set(`${huntId}:${userId}`, { huntId, userId, lat, lng, accuracy: 10, updatedAt });
  }
  async positions(huntId: string) {
    const canView = this.live(huntId).canView;
    return clone([...this.positionMap.values()].filter((p) => p.huntId === huntId && (canView || p.userId === this.uid())).map((p) => ({ userId: p.userId, lat: p.lat, lng: p.lng, accuracy: p.accuracy, updatedAt: p.updatedAt })));
  }
  async sharePosition(huntId: string, pos: { lat: number; lng: number; accuracy: number | null }) {
    if (!this.live(huntId).canShare) throw new AppError('Dafür fehlen dir die Berechtigungen.', 'forbidden');
    this.positionMap.set(`${huntId}:${this.uid()}`, { huntId, userId: this.uid(), ...pos, updatedAt: new Date().toISOString() });
  }
  async stopSharing(huntId: string) {
    this.positionMap.delete(`${huntId}:${this.uid()}`);
  }

}

export class FakeChat implements ChatService {
  messageList: ChatMessage[] = [];
  listeners = new Map<string, Set<() => void>>();
  /** Simuliert ein Funkloch: send wirft einen Netzwerkfehler. */
  offline = false;
  private seq = 0;
  constructor(private auth: FakeAuth, private groups: FakeGroups, private profiles: FakeProfiles) {}

  private member(groupId: string) {
    return this.groups.memberList.some((m) => m.groupId === groupId && m.userId === this.auth.user?.id);
  }
  private name(userId: string) {
    const p = this.profiles.profiles.get(userId);
    return p?.displayName || (p?.username ? `@${p.username}` : null);
  }
  private notify(groupId: string) {
    this.listeners.get(groupId)?.forEach((l) => l());
  }

  /** Nachricht eines anderen Mitglieds, wie sie per Echtzeit ankäme. */
  receive(groupId: string, senderId: string, content: string) {
    this.messageList.push({ id: `m${++this.seq}`, groupId, senderId, senderName: this.name(senderId), content, createdAt: new Date(Date.now() + this.seq).toISOString() });
    this.notify(groupId);
  }

  async messages(groupId: string) {
    if (!this.member(groupId)) return [];
    return clone(sortMessages(this.messageList.filter((m) => m.groupId === groupId)));
  }
  async send(groupId: string, input: MessageInput) {
    if (this.offline) throw new TypeError('Failed to fetch');
    if (!this.member(groupId)) throw new AppError('Dafür fehlen dir die Berechtigungen in dieser Gruppe.', 'forbidden');
    if (this.messageList.some((m) => m.id === input.id)) return;
    const uid = this.auth.user!.id;
    this.messageList.push({ id: input.id, groupId, senderId: uid, senderName: this.name(uid), content: input.content, createdAt: new Date(Date.now() + ++this.seq).toISOString() });
    this.notify(groupId);
  }
  async remove(messageId: string) {
    const m = this.messageList.find((x) => x.id === messageId);
    if (!m || m.senderId !== this.auth.user?.id) throw new AppError('Dafür fehlen dir die Berechtigungen.', 'forbidden');
    this.messageList = this.messageList.filter((x) => x.id !== messageId);
    this.notify(m.groupId);
  }
  subscribe(groupId: string, onChange: () => void) {
    const set = this.listeners.get(groupId) ?? new Set();
    set.add(onChange);
    this.listeners.set(groupId, set);
    return () => void set.delete(onChange);
  }
}
