import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServices } from '../../app/services';
import { REPORT_MUTATION_KEY, type ReportVariables } from '../../lib/offline';
import { AppError, mapError } from '../../lib/errors';
import { extraZonesOf, sortPhases, type ExtraZone, type HuntDraft, type HuntRole, type HuntStatus, type Participant, type Phase, type PhaseAssignment, type StandInput, type ZoneInput } from './huntModel';

export const huntKeys = {
  root: ['hunts'] as const,
  all: () => ['hunts', 'all'] as const,
  group: (groupId: string) => ['hunts', 'group', groupId] as const,
  one: (huntId: string) => ['hunts', 'one', huntId] as const,
  part: (huntId: string, part: 'participants' | 'stands' | 'zones' | 'reports' | 'positions' | 'phases' | 'assignments' | 'extraZones') => ['hunts', 'one', huntId, part] as const,
};

export function useAllHunts() {
  const { hunts } = useServices();
  return useQuery({ queryKey: huntKeys.all(), queryFn: () => hunts.all() });
}

export function useGroupHunts(groupId: string) {
  const { hunts } = useServices();
  return useQuery({ queryKey: huntKeys.group(groupId), queryFn: () => hunts.forGroup(groupId) });
}

export function useHunt(huntId: string) {
  const { hunts } = useServices();
  return useQuery({ queryKey: huntKeys.one(huntId), queryFn: () => hunts.get(huntId) });
}

export function useHuntDetails(huntId: string) {
  const { hunts } = useServices();
  const participants = useQuery({ queryKey: huntKeys.part(huntId, 'participants'), queryFn: () => hunts.participants(huntId) });
  const stands = useQuery({ queryKey: huntKeys.part(huntId, 'stands'), queryFn: () => hunts.stands(huntId) });
  const zones = useQuery({ queryKey: huntKeys.part(huntId, 'zones'), queryFn: () => hunts.zones(huntId) });
  const reports = useQuery({ queryKey: huntKeys.part(huntId, 'reports'), queryFn: () => hunts.reports(huntId) });
  const phases = useQuery({ queryKey: huntKeys.part(huntId, 'phases'), queryFn: () => hunts.phases(huntId) });
  const assignments = useQuery({ queryKey: huntKeys.part(huntId, 'assignments'), queryFn: () => hunts.assignments(huntId) });
  const extraZones = useQuery({ queryKey: huntKeys.part(huntId, 'extraZones'), queryFn: () => hunts.extraZones(huntId) });
  return { participants, stands, zones, reports, phases, assignments, extraZones };
}

export function useCreateHunt(groupId: string) {
  const { hunts } = useServices();
  const client = useQueryClient();
  return useMutation({ mutationFn: (draft: HuntDraft) => hunts.create(groupId, draft), onSuccess: () => client.invalidateQueries({ queryKey: huntKeys.root }) });
}

/** Alle Mutationen einer Jagd; danach wird alles zur Jagd neu geladen. */
export function useHuntActions(huntId: string) {
  const { hunts } = useServices();
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: huntKeys.root });
  const m = <A,>(fn: (a: A) => Promise<unknown>) => ({ mutationFn: fn, onSuccess });
  return {
    update: useMutation(m((draft: HuntDraft) => hunts.update(huntId, draft))),
    setStatus: useMutation(m((status: HuntStatus) => hunts.setStatus(huntId, status))),
    remove: useMutation(m(() => hunts.remove(huntId))),
    join: useMutation(m((role: HuntRole) => hunts.join(huntId, role))),
    addParticipant: useMutation(m(({ userId, role }: { userId: string; role: HuntRole }) => hunts.addParticipant(huntId, userId, role))),
    updateParticipant: useMutation(
      m(({ id, ...patch }: { id: string; role?: HuntRole; note?: string; standId?: string | null; zoneId?: string | null }) => hunts.updateParticipant(id, patch)),
    ),
    removeParticipant: useMutation(m((participantId: string) => hunts.removeParticipant(participantId))),
    createZone: useMutation(m((input: ZoneInput) => hunts.createZone(huntId, input))),
    /** Karten-Import: Zonen und Stände nacheinander anlegen. */
    importMap: useMutation(
      m(async ({ zones, stands }: { zones: ZoneInput[]; stands: StandInput[] }) => {
        const total = zones.length + stands.length;
        let done = 0;
        try {
          for (const z of zones) {
            await hunts.createZone(huntId, z);
            done++;
          }
          for (const s of stands) {
            await hunts.createStand(huntId, s);
            done++;
          }
        } catch (e) {
          if (done === 0) throw e;
          throw new AppError(`${done} von ${total} Einträgen wurden gespeichert, dann: ${mapError(e).message}`, mapError(e).kind, e);
        }
        return { zones: zones.length, stands: stands.length };
      }),
    ),
    removeZone: useMutation(m((zoneId: string) => hunts.removeZone(zoneId))),
    setZoneColor: useMutation(m(({ id, color }: { id: string; color: string | null }) => hunts.setZoneColor(id, color))),
    /**
     * Zonen eines Teilnehmers setzen: die erste wird wie bisher die Zone (zone_id), alle weiteren
     * kommen in hunt_participant_zones (Migration 0018). Ohne `plan` gilt das für die aktive Phase
     * bzw. die Jagd ohne Phasen; mit `plan` für eine andere Phase.
     */
    setZones: useMutation(
      m(
        async ({
          participantId,
          phaseId,
          zoneIds,
          currentMain,
          extras,
          plan,
        }: {
          participantId: string;
          phaseId: string | null;
          zoneIds: string[];
          currentMain: string | null;
          extras: ExtraZone[];
          plan?: { standId: string | null };
        }) => {
          const [main = null, ...rest] = zoneIds;
          if (plan && phaseId) {
            if (main !== currentMain) await hunts.setAssignment(huntId, { phaseId, participantId, standId: plan.standId, zoneId: main });
          } else if (main !== currentMain) await hunts.updateParticipant(participantId, { zoneId: main });
          const current = extraZonesOf(extras, participantId, phaseId);
          for (const e of current.filter((x) => !rest.includes(x.zoneId))) await hunts.removeExtraZone(e.id);
          for (const z of rest.filter((id) => !current.some((x) => x.zoneId === id))) await hunts.addExtraZone(huntId, { participantId, zoneId: z, phaseId });
        },
      ),
    ),
    createStand: useMutation(m((input: StandInput) => hunts.createStand(huntId, input))),
    updateStand: useMutation(m(({ id, input }: { id: string; input: StandInput }) => hunts.updateStand(id, input))),
    removeStand: useMutation(m((standId: string) => hunts.removeStand(standId))),
    /** Läuft über die Offline-Warteschlange (lib/offline.ts); Variablen: { huntId, input }. */
    createReport: useMutation<void, Error, ReportVariables>({ mutationKey: REPORT_MUTATION_KEY }),
    setReportResolved: useMutation(m(({ id, resolved }: { id: string; resolved: boolean }) => hunts.setReportResolved(id, resolved))),
    removeReport: useMutation(m((reportId: string) => hunts.removeReport(reportId))),
    /**
     * Neue Phase anlegen. Sie startet mit der Zuteilung der aktiven Phase (bzw. der heutigen
     * Zuteilung, wenn es noch keine Phasen gibt); die erste Phase wird gleich aktiv.
     */
    addPhase: useMutation(
      m(
        async ({
          phases,
          currentPhaseId,
          participants,
          assignments,
          extras,
        }: {
          phases: Phase[];
          currentPhaseId: string | null;
          participants: Participant[];
          assignments: PhaseAssignment[];
          /** Weitere Zonen; null = Migration 0018 fehlt. */
          extras?: ExtraZone[] | null;
        }) => {
        const sorted = sortPhases(phases);
        const phase = await hunts.createPhase(huntId, { name: `Phase ${sorted.length + 1}`, sortOrder: (sorted.at(-1)?.sortOrder ?? 0) + 1 });
        const source = participants.map((p) => {
          const a = currentPhaseId ? assignments.find((x) => x.phaseId === currentPhaseId && x.participantId === p.id) : null;
          return { participantId: p.id, standId: currentPhaseId ? (a?.standId ?? null) : p.standId, zoneId: currentPhaseId ? (a?.zoneId ?? null) : p.zoneId };
        });
        for (const s of source.filter((x) => x.standId || x.zoneId)) await hunts.setAssignment(huntId, { phaseId: phase.id, ...s });
        // Weitere Zonen der aktiven Phase (bzw. der Jagd ohne Phasen) mitnehmen.
        for (const e of (extras ?? []).filter((x) => x.phaseId === currentPhaseId && participants.some((p) => p.id === x.participantId))) {
          await hunts.addExtraZone(huntId, { participantId: e.participantId, zoneId: e.zoneId, phaseId: phase.id });
        }
        if (sorted.length === 0) await hunts.activatePhase(huntId, phase.id);
        return phase;
        },
      ),
    ),
    removePhase: useMutation(m((phaseId: string) => hunts.removePhase(phaseId))),
    activatePhase: useMutation(m((phaseId: string) => hunts.activatePhase(huntId, phaseId))),
    setAssignment: useMutation(m((a: PhaseAssignment) => hunts.setAssignment(huntId, a))),
  };
}

export type HuntActions = ReturnType<typeof useHuntActions>;

/** Live-Standorte der laufenden Jagd, alle 10 s neu (nur wer sie sehen darf). */
export function useHuntPositions(huntId: string, enabled: boolean) {
  const { hunts } = useServices();
  return useQuery({
    queryKey: huntKeys.part(huntId, 'positions'),
    queryFn: () => hunts.positions(huntId),
    enabled,
    refetchInterval: enabled ? 10_000 : false,
    staleTime: 5_000,
  });
}

/** Zonen und Stände mehrerer Jagden (Reiter „Karte“), aus denselben Caches wie die Jagdseite. */
export function useHuntsMapData(huntIds: string[]) {
  const { hunts } = useServices();
  const zones = useQueries({ queries: huntIds.map((id) => ({ queryKey: huntKeys.part(id, 'zones'), queryFn: () => hunts.zones(id) })) });
  const stands = useQueries({ queries: huntIds.map((id) => ({ queryKey: huntKeys.part(id, 'stands'), queryFn: () => hunts.stands(id) })) });
  return {
    zones: zones.flatMap((q) => q.data ?? []),
    stands: stands.flatMap((q) => q.data ?? []),
  };
}
