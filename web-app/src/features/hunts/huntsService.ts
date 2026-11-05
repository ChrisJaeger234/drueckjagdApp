import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, check, guard, unwrap } from '../../lib/errors';
import {
  ASSIGNMENT_COLUMNS,
  PHASE_COLUMNS,
  assignmentFromRow,
  phaseFromRow,
  sortPhases,
  type AssignmentRow,
  type Phase,
  type PhaseAssignment,
  type PhaseRow,
  HUNT_COLUMNS,
  PARTICIPANT_COLUMNS,
  POSITION_COLUMNS,
  REPORT_COLUMNS,
  STAND_COLUMNS,
  ZONE_COLUMNS,
  huntDraftToRow,
  huntFromRow,
  participantFromRow,
  positionFromRow,
  reportFromRow,
  sortHunts,
  sortParticipants,
  sortStands,
  standFromRow,
  zoneFromRow,
  type Hunt,
  type HuntDraft,
  type HuntRole,
  type HuntRow,
  type HuntStatus,
  type LivePosition,
  type Participant,
  type ParticipantRow,
  type PositionRow,
  type Report,
  type ReportInput,
  type ReportRow,
  type Stand,
  type StandInput,
  type StandRow,
  type Zone,
  type ZoneInput,
  type ZoneRow,
} from './huntModel';

/** Port von HuntsRepository (Flutter). Berechtigungen prüft der Server (RLS und Trigger). */
export interface HuntsService {
  all(): Promise<Hunt[]>;
  forGroup(groupId: string): Promise<Hunt[]>;
  get(huntId: string): Promise<Hunt>;
  /** Legt eine Jagd an; der Ersteller wird per Trigger Jagdleiter. */
  create(groupId: string, draft: HuntDraft): Promise<Hunt>;
  update(huntId: string, draft: HuntDraft): Promise<void>;
  setStatus(huntId: string, status: HuntStatus): Promise<void>;
  remove(huntId: string): Promise<void>;

  participants(huntId: string): Promise<Participant[]>;
  join(huntId: string, role: HuntRole): Promise<void>;
  addParticipant(huntId: string, userId: string, role: HuntRole): Promise<void>;
  updateParticipant(participantId: string, patch: { role?: HuntRole; note?: string; standId?: string | null; zoneId?: string | null }): Promise<void>;
  removeParticipant(participantId: string): Promise<void>;

  zones(huntId: string): Promise<Zone[]>;
  createZone(huntId: string, input: ZoneInput): Promise<void>;
  removeZone(zoneId: string): Promise<void>;

  stands(huntId: string): Promise<Stand[]>;
  createStand(huntId: string, input: StandInput): Promise<Stand>;
  updateStand(standId: string, input: StandInput): Promise<void>;
  removeStand(standId: string): Promise<void>;

  reports(huntId: string): Promise<Report[]>;
  createReport(huntId: string, input: ReportInput): Promise<void>;
  setReportResolved(reportId: string, resolved: boolean): Promise<void>;
  removeReport(reportId: string): Promise<void>;

  /** Live-Standorte der laufenden Jagd, soweit RLS sie zeigt (Migration 0011). */
  positions(huntId: string): Promise<LivePosition[]>;
  sharePosition(huntId: string, pos: { lat: number; lng: number; accuracy: number | null }): Promise<void>;
  stopSharing(huntId: string): Promise<void>;

  /** Phasen und ihre Zuteilung (Migration 0016). */
  phases(huntId: string): Promise<Phase[]>;
  assignments(huntId: string): Promise<PhaseAssignment[]>;
  createPhase(huntId: string, input: { name: string; sortOrder: number }): Promise<Phase>;
  removePhase(phaseId: string): Promise<void>;
  /** Schaltet die Phase aktiv und übernimmt ihre Zuteilung für alle Teilnehmer. */
  activatePhase(huntId: string, phaseId: string): Promise<void>;
  setAssignment(huntId: string, a: PhaseAssignment): Promise<void>;
}

const FORBIDDEN = () => new AppError('Dafür fehlen dir die Berechtigungen.', 'forbidden');
const requireAny = (rows: unknown[]) => {
  if (rows.length === 0) throw FORBIDDEN();
};

const standRow = (s: StandInput) => ({
  label: s.label.trim(),
  latitude: s.lat,
  longitude: s.lng,
  waypoint_id: s.waypointId,
  // Spalte erst ab Migration 0015; ohne Art nicht mitschicken.
  ...(s.category !== undefined ? { category: s.category } : {}),
  description: s.description.trim(),
});

export function createSupabaseHuntsService(client: SupabaseClient): HuntsService {
  const updateOne = async (table: string, id: string, patch: Record<string, unknown>) =>
    requireAny(unwrap(await client.from(table).update(patch).eq('id', id).select('id')));
  const deleteOne = async (table: string, id: string) => requireAny(unwrap(await client.from(table).delete().eq('id', id).select('id')));

  return {
    all: () => guard(async () => sortHunts(unwrap(await client.from('hunts').select(HUNT_COLUMNS).returns<HuntRow[]>()).map(huntFromRow))),
    forGroup: (groupId) =>
      guard(async () => sortHunts(unwrap(await client.from('hunts').select(HUNT_COLUMNS).eq('group_id', groupId).returns<HuntRow[]>()).map(huntFromRow))),
    get: (huntId) =>
      guard(async () => {
        const row = unwrap(await client.from('hunts').select(HUNT_COLUMNS).eq('id', huntId).maybeSingle<HuntRow>());
        if (!row) throw new AppError('Diese Jagd existiert nicht oder du hast keinen Zugriff.', 'notFound');
        return huntFromRow(row);
      }),
    create: (groupId, draft) =>
      guard(async () =>
        huntFromRow(unwrap(await client.from('hunts').insert({ ...huntDraftToRow(draft), group_id: groupId }).select(HUNT_COLUMNS).single<HuntRow>())),
      ),
    update: (huntId, draft) => guard(() => updateOne('hunts', huntId, huntDraftToRow(draft))),
    setStatus: (huntId, status) => guard(() => updateOne('hunts', huntId, { status })),
    remove: (huntId) => guard(() => deleteOne('hunts', huntId)),

    participants: (huntId) =>
      guard(async () =>
        sortParticipants(
          unwrap(await client.from('hunt_participants').select(PARTICIPANT_COLUMNS).eq('hunt_id', huntId).returns<ParticipantRow[]>()).map(participantFromRow),
        ),
      ),
    join: (huntId, role) => guard(async () => check(await client.from('hunt_participants').insert({ hunt_id: huntId, role }))),
    addParticipant: (huntId, userId, role) =>
      guard(async () => check(await client.from('hunt_participants').insert({ hunt_id: huntId, user_id: userId, role }))),
    updateParticipant: (participantId, patch) =>
      guard(() =>
        updateOne('hunt_participants', participantId, {
          ...(patch.role !== undefined && { role: patch.role }),
          ...(patch.note !== undefined && { note: patch.note.trim() }),
          ...(patch.standId !== undefined && { stand_id: patch.standId }),
          ...(patch.zoneId !== undefined && { zone_id: patch.zoneId }),
        }),
      ),
    removeParticipant: (participantId) => guard(() => deleteOne('hunt_participants', participantId)),

    zones: (huntId) =>
      guard(async () =>
        unwrap(await client.from('hunt_zones').select(ZONE_COLUMNS).eq('hunt_id', huntId).order('name').returns<ZoneRow[]>()).map(zoneFromRow),
      ),
    createZone: (huntId, { name, kind, geometry, color }) =>
      guard(async () => check(await client.from('hunt_zones').insert({ hunt_id: huntId, name: name.trim(), kind, boundary_data: geometry, color: color ?? null }))),
    removeZone: (zoneId) => guard(() => deleteOne('hunt_zones', zoneId)),

    stands: (huntId) =>
      guard(async () => sortStands(unwrap(await client.from('hunt_stands').select(STAND_COLUMNS).eq('hunt_id', huntId).returns<StandRow[]>()).map(standFromRow))),
    createStand: (huntId, input) =>
      guard(async () =>
        standFromRow(unwrap(await client.from('hunt_stands').insert({ hunt_id: huntId, ...standRow(input) }).select(STAND_COLUMNS).single<StandRow>())),
      ),
    updateStand: (standId, input) => guard(() => updateOne('hunt_stands', standId, standRow(input))),
    removeStand: (standId) => guard(() => deleteOne('hunt_stands', standId)),

    reports: (huntId) =>
      guard(async () =>
        unwrap(
          await client.from('hunt_reports').select(REPORT_COLUMNS).eq('hunt_id', huntId).order('occurred_at', { ascending: false }).returns<ReportRow[]>(),
        ).map(reportFromRow),
      ),
    createReport: (huntId, r) =>
      guard(async () => {
        const { error } = await client.from('hunt_reports').insert({
          id: r.id,
          hunt_id: huntId,
          kind: r.kind,
          species: r.species.trim(),
          count: r.count,
          stand_id: r.standId,
          latitude: r.lat,
          longitude: r.lng,
          note: r.note.trim(),
          occurred_at: r.occurredAt,
        });
        // Schon angekommen (z. B. Antwort ging im Funkloch verloren): kein Fehler, keine Dublette.
        if (error && !(error.code === '23505' && error.message.includes('hunt_reports_pkey'))) throw error;
      }),
    setReportResolved: (reportId, resolved) => guard(() => updateOne('hunt_reports', reportId, { resolved_at: resolved ? new Date().toISOString() : null })),
    removeReport: (reportId) => guard(() => deleteOne('hunt_reports', reportId)),

    positions: (huntId) =>
      guard(async () => unwrap(await client.from('hunt_positions').select(POSITION_COLUMNS).eq('hunt_id', huntId).returns<PositionRow[]>()).map(positionFromRow)),
    sharePosition: (huntId, p) =>
      guard(async () =>
        check(await client.rpc('share_hunt_position', { p_hunt_id: huntId, p_latitude: p.lat, p_longitude: p.lng, p_accuracy: p.accuracy ?? undefined })),
      ),
    stopSharing: (huntId) => guard(async () => check(await client.rpc('stop_hunt_position', { p_hunt_id: huntId }))),

    phases: (huntId) =>
      guard(async () => sortPhases(unwrap(await client.from('hunt_phases').select(PHASE_COLUMNS).eq('hunt_id', huntId).returns<PhaseRow[]>()).map(phaseFromRow))),
    assignments: (huntId) =>
      guard(async () => unwrap(await client.from('hunt_phase_assignments').select(ASSIGNMENT_COLUMNS).eq('hunt_id', huntId).returns<AssignmentRow[]>()).map(assignmentFromRow)),
    createPhase: (huntId, { name, sortOrder }) =>
      guard(async () =>
        phaseFromRow(unwrap(await client.from('hunt_phases').insert({ hunt_id: huntId, name: name.trim(), sort_order: sortOrder }).select(PHASE_COLUMNS).single<PhaseRow>())),
      ),
    removePhase: (phaseId) => guard(() => deleteOne('hunt_phases', phaseId)),
    activatePhase: (huntId, phaseId) => guard(async () => check(await client.rpc('activate_hunt_phase', { p_hunt_id: huntId, p_phase_id: phaseId }))),
    setAssignment: (huntId, a) =>
      guard(async () => {
        // Erst ändern, sonst anlegen (Upsert bräuchte Update-Rechte auf die Schlüsselspalten).
        const updated = unwrap(
          await client
            .from('hunt_phase_assignments')
            .update({ stand_id: a.standId, zone_id: a.zoneId })
            .eq('phase_id', a.phaseId)
            .eq('participant_id', a.participantId)
            .select('phase_id'),
        );
        if (updated.length === 0) {
          check(
            await client
              .from('hunt_phase_assignments')
              .insert({ hunt_id: huntId, phase_id: a.phaseId, participant_id: a.participantId, stand_id: a.standId, zone_id: a.zoneId }),
          );
        }
      }),
  };
}
