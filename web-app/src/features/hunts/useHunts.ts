import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServices } from '../../app/services';
import { REPORT_MUTATION_KEY, type ReportVariables } from '../../lib/offline';
import type { Boundary } from '../reviere/revierModel';
import type { HuntDraft, HuntRole, HuntStatus, StandInput, ZoneKind } from './huntModel';

export const huntKeys = {
  root: ['hunts'] as const,
  all: () => ['hunts', 'all'] as const,
  group: (groupId: string) => ['hunts', 'group', groupId] as const,
  one: (huntId: string) => ['hunts', 'one', huntId] as const,
  part: (huntId: string, part: 'participants' | 'stands' | 'zones' | 'reports' | 'positions') => ['hunts', 'one', huntId, part] as const,
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
  return { participants, stands, zones, reports };
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
    createZone: useMutation(m((input: { name: string; kind: ZoneKind; geometry: Boundary }) => hunts.createZone(huntId, input))),
    removeZone: useMutation(m((zoneId: string) => hunts.removeZone(zoneId))),
    createStand: useMutation(m((input: StandInput) => hunts.createStand(huntId, input))),
    updateStand: useMutation(m(({ id, input }: { id: string; input: StandInput }) => hunts.updateStand(id, input))),
    removeStand: useMutation(m((standId: string) => hunts.removeStand(standId))),
    /** Läuft über die Offline-Warteschlange (lib/offline.ts); Variablen: { huntId, input }. */
    createReport: useMutation<void, Error, ReportVariables>({ mutationKey: REPORT_MUTATION_KEY }),
    setReportResolved: useMutation(m(({ id, resolved }: { id: string; resolved: boolean }) => hunts.setReportResolved(id, resolved))),
    removeReport: useMutation(m((reportId: string) => hunts.removeReport(reportId))),
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
