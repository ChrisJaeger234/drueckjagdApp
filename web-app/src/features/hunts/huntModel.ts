// Port von lib/features/hunts/domain der Flutter-App (Migration 0010).
import type { GroupRole } from '../groups/groupModel';
import type { Boundary } from '../reviere/revierModel';

// ------------------------------------------------------------ Aufzählungen

export const HUNT_STATUS = { geplant: 'Geplant', laufend: 'Läuft', beendet: 'Beendet', abgesagt: 'Abgesagt' } as const;
export type HuntStatus = keyof typeof HUNT_STATUS;
export const isOpenStatus = (s: HuntStatus) => s === 'geplant' || s === 'laufend';

export const HUNT_ROLES = {
  jagdleiter: 'Jagdleiter',
  ansteller: 'Ansteller',
  schuetze: 'Schütze',
  treiber: 'Treiber',
  hundefuehrer: 'Hundeführer',
  bergung: 'Bergung',
  sonstige: 'Sonstige',
} as const;
export type HuntRole = keyof typeof HUNT_ROLES;
export const isLeadRole = (r: HuntRole) => r === 'jagdleiter' || r === 'ansteller';
/** Rollen, die man sich selbst geben darf (Trigger guard_hunt_participant). */
export const SELF_ASSIGNABLE_ROLES = (Object.keys(HUNT_ROLES) as HuntRole[]).filter((r) => !isLeadRole(r));

export const ZONE_KINDS = {
  treiben: 'Treiben',
  sicherheitszone: 'Sicherheitszone',
  sperrzone: 'Sperrzone',
  sammelplatz: 'Sammelplatz',
  sonstiges: 'Sonstiges',
} as const;
export type ZoneKind = keyof typeof ZONE_KINDS;
export const ZONE_COLORS: Record<ZoneKind, string> = {
  treiben: '#2f7d32',
  sicherheitszone: '#d9480f',
  sperrzone: '#b3261e',
  sammelplatz: '#1f5c8a',
  sonstiges: '#6b6b6b',
};

export const REPORT_KINDS = {
  erlegt: 'Erlegt',
  angeschossen: 'Angeschossen',
  ueberschossen: 'Überschossen',
  anblick: 'Anblick',
  sonstiges: 'Sonstiges',
} as const;
export type ReportKind = keyof typeof REPORT_KINDS;
/** Meldungen mit Folgeaktion (Nachsuche, Bergung) können erledigt werden. */
export const needsFollowUp = (k: ReportKind) => k === 'angeschossen' || k === 'erlegt';

/** Häufige Wildarten bei Drückjagden (frei ergänzbar). */
export const COMMON_SPECIES = ['Schwarzwild', 'Rehwild', 'Rotwild', 'Damwild', 'Fuchs', 'Waschbär'];

const parseEnum = <T extends string>(map: Record<T, string>, fallback: T) => (v: string): T => (v in map ? (v as T) : fallback);
export const parseStatus = parseEnum(HUNT_STATUS, 'geplant');
export const parseHuntRole = parseEnum(HUNT_ROLES, 'sonstige');
export const parseZoneKind = parseEnum(ZONE_KINDS, 'sonstiges');
export const parseReportKind = parseEnum(REPORT_KINDS, 'sonstiges');

// ------------------------------------------------------------ Jagd

export interface Hunt {
  id: string;
  groupId: string;
  groupName: string | null;
  revierId: string | null;
  revierName: string | null;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  status: HuntStatus;
  meetingPoint: string;
  meetingLat: number | null;
  meetingLng: number | null;
  gameRelease: string;
  safetyNotes: string;
  emergencyInfo: string;
  selfJoin: boolean;
  createdBy: string | null;
}

export const HUNT_COLUMNS =
  'id, group_id, revier_id, title, description, starts_at, ends_at, status, meeting_point, meeting_latitude, meeting_longitude, ' +
  'game_release, safety_notes, emergency_info, self_join, created_by, group:groups(name), revier:reviere(name)';

export interface HuntRow {
  id: string;
  group_id: string;
  revier_id: string | null;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  status: string;
  meeting_point: string | null;
  meeting_latitude: number | null;
  meeting_longitude: number | null;
  game_release: string | null;
  safety_notes: string | null;
  emergency_info: string | null;
  self_join: boolean | null;
  created_by: string | null;
  group?: { name: string } | null;
  revier?: { name: string } | null;
}

export function huntFromRow(r: HuntRow): Hunt {
  return {
    id: r.id,
    groupId: r.group_id,
    groupName: r.group?.name ?? null,
    revierId: r.revier_id,
    revierName: r.revier?.name ?? null,
    title: r.title,
    description: r.description ?? '',
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    status: parseStatus(r.status),
    meetingPoint: r.meeting_point ?? '',
    meetingLat: r.meeting_latitude,
    meetingLng: r.meeting_longitude,
    gameRelease: r.game_release ?? '',
    safetyNotes: r.safety_notes ?? '',
    emergencyInfo: r.emergency_info ?? '',
    selfJoin: r.self_join ?? true,
    createdBy: r.created_by,
  };
}

export interface HuntDraft {
  title: string;
  revierId: string | null;
  description: string;
  startsAt: string;
  endsAt: string | null;
  meetingPoint: string;
  gameRelease: string;
  safetyNotes: string;
  emergencyInfo: string;
  selfJoin: boolean;
}

export const huntDraftToRow = (d: HuntDraft) => ({
  title: d.title.trim(),
  revier_id: d.revierId,
  description: d.description.trim(),
  starts_at: new Date(d.startsAt).toISOString(),
  ends_at: d.endsAt ? new Date(d.endsAt).toISOString() : null,
  meeting_point: d.meetingPoint.trim(),
  game_release: d.gameRelease.trim(),
  safety_notes: d.safetyNotes.trim(),
  emergency_info: d.emergencyInfo.trim(),
  self_join: d.selfJoin,
});

export const canSelfJoinHunt = (h: Hunt) => h.selfJoin && isOpenStatus(h.status);

/** Kommende und laufende Jagden zuerst (aufsteigend), danach vergangene (absteigend). */
export function sortHunts(list: Hunt[]): Hunt[] {
  const upcoming = list.filter((h) => isOpenStatus(h.status)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = list.filter((h) => !isOpenStatus(h.status)).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  return [...upcoming, ...past];
}

// ------------------------------------------------------------ Teilnehmer, Stände, Zonen, Meldungen

export interface Participant {
  id: string;
  huntId: string;
  userId: string;
  role: HuntRole;
  standId: string | null;
  zoneId: string | null;
  note: string;
  name: string;
}

export const PARTICIPANT_COLUMNS = 'id, hunt_id, user_id, role, stand_id, zone_id, note, profile:profiles(display_name, username)';

export interface ParticipantRow {
  id: string;
  hunt_id: string;
  user_id: string;
  role: string;
  stand_id: string | null;
  zone_id: string | null;
  note: string | null;
  profile?: { display_name: string | null; username: string | null } | null;
}

export function participantFromRow(r: ParticipantRow): Participant {
  const display = r.profile?.display_name?.trim();
  return {
    id: r.id,
    huntId: r.hunt_id,
    userId: r.user_id,
    role: parseHuntRole(r.role),
    standId: r.stand_id,
    zoneId: r.zone_id,
    note: r.note ?? '',
    name: display || (r.profile?.username ? `@${r.profile.username}` : 'Unbekannt'),
  };
}

const ROLE_ORDER = Object.keys(HUNT_ROLES) as HuntRole[];
export const sortParticipants = (list: Participant[]) =>
  [...list].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name, 'de'));

export interface Stand {
  id: string;
  huntId: string;
  label: string;
  waypointId: string | null;
  zoneId: string | null;
  lat: number;
  lng: number;
  description: string;
  sortOrder: number;
}

export const STAND_COLUMNS = 'id, hunt_id, label, waypoint_id, zone_id, latitude, longitude, description, sort_order';

export interface StandRow {
  id: string;
  hunt_id: string;
  label: string;
  waypoint_id: string | null;
  zone_id: string | null;
  latitude: number;
  longitude: number;
  description: string | null;
  sort_order: number | null;
}

export const standFromRow = (r: StandRow): Stand => ({
  id: r.id,
  huntId: r.hunt_id,
  label: r.label,
  waypointId: r.waypoint_id,
  zoneId: r.zone_id,
  lat: r.latitude,
  lng: r.longitude,
  description: r.description ?? '',
  sortOrder: r.sort_order ?? 0,
});

/** Stände natürlich sortiert: „Stand 2“ vor „Stand 10“. */
export const sortStands = (list: Stand[]) =>
  [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'de', { numeric: true }));

export interface StandInput {
  label: string;
  lat: number;
  lng: number;
  waypointId: string | null;
  description: string;
}

export interface Zone {
  id: string;
  huntId: string;
  name: string;
  kind: ZoneKind;
  description: string;
  color: string | null;
  geometry: Boundary;
}

export interface ZoneInput {
  name: string;
  kind: ZoneKind;
  geometry: Boundary;
  /** #rrggbb, sonst Farbe der Zonenart. */
  color?: string | null;
}

export const ZONE_COLUMNS = 'id, hunt_id, name, kind, description, color, boundary_data';

export interface ZoneRow {
  id: string;
  hunt_id: string;
  name: string;
  kind: string;
  description: string | null;
  color: string | null;
  boundary_data: Boundary;
}

export const zoneFromRow = (r: ZoneRow): Zone => ({
  id: r.id,
  huntId: r.hunt_id,
  name: r.name,
  kind: parseZoneKind(r.kind),
  description: r.description ?? '',
  color: r.color,
  geometry: r.boundary_data,
});

export const zoneColor = (z: Pick<Zone, 'kind' | 'color'>) => z.color ?? ZONE_COLORS[z.kind];

export interface Report {
  id: string;
  huntId: string;
  reporterId: string | null;
  reporterName: string | null;
  kind: ReportKind;
  species: string;
  count: number;
  standId: string | null;
  lat: number | null;
  lng: number | null;
  note: string;
  occurredAt: string;
  resolvedAt: string | null;
  /** Nur lokal: Meldung wartet in der Warteschlange auf Netz. */
  pending?: boolean;
}

export const REPORT_COLUMNS =
  'id, hunt_id, reporter_id, kind, species, count, stand_id, latitude, longitude, note, occurred_at, resolved_at, ' +
  'reporter:profiles!hunt_reports_reporter_id_fkey(display_name, username)';

export interface ReportRow {
  id: string;
  hunt_id: string;
  reporter_id: string | null;
  kind: string;
  species: string | null;
  count: number | null;
  stand_id: string | null;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  occurred_at: string;
  resolved_at: string | null;
  reporter?: { display_name: string | null; username: string | null } | null;
}

export const reportFromRow = (r: ReportRow): Report => ({
  id: r.id,
  huntId: r.hunt_id,
  reporterId: r.reporter_id,
  reporterName: r.reporter?.display_name?.trim() || (r.reporter?.username ? `@${r.reporter.username}` : null),
  kind: parseReportKind(r.kind),
  species: r.species ?? '',
  count: r.count ?? 1,
  standId: r.stand_id,
  lat: r.latitude,
  lng: r.longitude,
  note: r.note ?? '',
  occurredAt: r.occurred_at,
  resolvedAt: r.resolved_at,
});

export const isOpenFollowUp = (r: Report) => r.kind === 'angeschossen' && !r.resolvedAt;

export interface ReportInput {
  /** Vom Gerät vergeben, damit eine wiederholte Übertragung keine doppelte Meldung erzeugt. */
  id: string;
  /** Zeitpunkt des Antippens, nicht der Übertragung (wichtig im Funkloch). */
  occurredAt: string;
  kind: ReportKind;
  species: string;
  count: number;
  standId: string | null;
  lat: number | null;
  lng: number | null;
  note: string;
}

// ------------------------------------------------------------ Berechtigungen

/**
 * Spiegelt Migration 0010 nur für die Darstellung (wie hunt_permissions.dart).
 * Durchgesetzt wird ausschließlich in der Datenbank.
 */
export function huntPermissions(userId: string, groupRole: GroupRole | null, me: Participant | null) {
  const isGroupAdmin = groupRole === 'owner' || groupRole === 'admin';
  const canManage = isGroupAdmin || (me ? isLeadRole(me.role) : false);
  return {
    isGroupAdmin,
    canManage,
    canDelete: isGroupAdmin,
    /** Jagdleiter ernennen: Owner/Admin oder selbst Jagdleiter (nicht Ansteller). */
    canAppointLeader: isGroupAdmin || me?.role === 'jagdleiter',
    canSelfJoin: (h: Hunt) => groupRole != null && !me && canSelfJoinHunt(h),
    canReport: groupRole != null,
    canEditReport: (r: Report) => groupRole != null && (r.reporterId === userId || canManage),
    /** Rollen, die diese Person vergeben darf. */
    assignableRoles: (Object.keys(HUNT_ROLES) as HuntRole[]).filter((r) =>
      r === 'jagdleiter' ? isGroupAdmin || me?.role === 'jagdleiter' : isLeadRole(r) ? canManage : true,
    ),
  };
}

export type HuntPermissions = ReturnType<typeof huntPermissions>;

// ------------------------------------------------------------ Live-Standorte (Phase 8)

/** Rollen, die während der laufenden Jagd ihren Standort teilen und die anderen sehen (Migration 0011). */
export const POSITION_SHARING_ROLES: readonly HuntRole[] = ['treiber', 'hundefuehrer', 'bergung', 'jagdleiter', 'ansteller'];
export const sharesPosition = (r: HuntRole) => POSITION_SHARING_ROLES.includes(r);

export function livePermissions(hunt: Hunt, groupRole: GroupRole | null, me: Participant | null) {
  const running = hunt.status === 'laufend';
  const sharingRole = me != null && sharesPosition(me.role);
  return {
    canShare: running && sharingRole,
    canView: running && (sharingRole || groupRole === 'owner' || groupRole === 'admin'),
  };
}

export interface LivePosition {
  userId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  updatedAt: string;
}

export const POSITION_COLUMNS = 'user_id, latitude, longitude, accuracy, updated_at';

export interface PositionRow {
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  updated_at: string;
}

export const positionFromRow = (r: PositionRow): LivePosition => ({ userId: r.user_id, lat: r.latitude, lng: r.longitude, accuracy: r.accuracy, updatedAt: r.updated_at });

/** Farben der Live-Marker je Rolle. */
export function roleColor(r: HuntRole): string {
  switch (r) {
    case 'treiber':
      return '#e8710a';
    case 'hundefuehrer':
      return '#8e24aa';
    case 'bergung':
      return '#00838f';
    default:
      return '#c62828';
  }
}

/** Alter einer Position in Worten, z. B. „vor 2 Min.“. */
export function positionAge(updatedAt: string, now = Date.now()): { text: string; stale: boolean } {
  const seconds = Math.max(0, Math.round((now - new Date(updatedAt).getTime()) / 1000));
  const stale = seconds > 120;
  if (seconds < 60) return { text: 'gerade eben', stale };
  const minutes = Math.round(seconds / 60);
  return { text: minutes < 60 ? `vor ${minutes} Min.` : `vor ${Math.round(minutes / 60)} Std.`, stale };
}

/** Neue Meldung mit Geräte-ID und aktuellem Zeitpunkt. */
export function newReport(fields: Omit<ReportInput, 'id' | 'occurredAt'>): ReportInput {
  return { id: crypto.randomUUID(), occurredAt: new Date().toISOString(), ...fields };
}
