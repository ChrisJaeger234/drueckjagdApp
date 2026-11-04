import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServices } from '../../app/services';
import type { Boundary, WaypointInput } from './revierModel';

export const revierKeys = {
  root: ['reviere'] as const,
  all: () => ['reviere', 'all'] as const,
  group: (groupId: string) => ['reviere', 'group', groupId] as const,
  one: (revierId: string) => ['reviere', 'one', revierId] as const,
  boundaries: (ids: string[]) => ['reviere', 'boundaries', ...ids] as const,
  waypoints: (ids: string[]) => ['reviere', 'waypoints', ...ids] as const,
};

export function useAllReviere() {
  const { reviere } = useServices();
  return useQuery({ queryKey: revierKeys.all(), queryFn: () => reviere.all() });
}

export function useGroupReviere(groupId: string) {
  const { reviere } = useServices();
  return useQuery({ queryKey: revierKeys.group(groupId), queryFn: () => reviere.forGroup(groupId) });
}

export function useRevier(revierId: string) {
  const { reviere } = useServices();
  return useQuery({ queryKey: revierKeys.one(revierId), queryFn: () => reviere.get(revierId) });
}

export function useBoundaries(revierIds: string[]) {
  const { reviere } = useServices();
  return useQuery({ queryKey: revierKeys.boundaries(revierIds), queryFn: () => reviere.boundaries(revierIds), enabled: revierIds.length > 0 });
}

export function useWaypoints(revierIds: string[]) {
  const { reviere } = useServices();
  return useQuery({ queryKey: revierKeys.waypoints(revierIds), queryFn: () => reviere.waypoints(revierIds), enabled: revierIds.length > 0 });
}

/** Alle Mutationen laden danach sämtliche Revierdaten neu (Liste, Karte, Detail). */
export function useRevierActions() {
  const { reviere } = useServices();
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: revierKeys.root });
  return {
    create: useMutation({ mutationFn: (input: { groupId: string; name: string; description: string }) => reviere.create(input), onSuccess }),
    update: useMutation({
      mutationFn: ({ revierId, ...input }: { revierId: string; name: string; description: string }) => reviere.update(revierId, input),
      onSuccess,
    }),
    remove: useMutation({ mutationFn: (revierId: string) => reviere.remove(revierId), onSuccess }),
    saveBoundary: useMutation({
      mutationFn: ({ revierId, geometry }: { revierId: string; geometry: Boundary }) => reviere.saveBoundary(revierId, geometry),
      onSuccess,
    }),
    removeBoundary: useMutation({ mutationFn: (revierId: string) => reviere.removeBoundary(revierId), onSuccess }),
    createWaypoint: useMutation({
      mutationFn: ({ revierId, input }: { revierId: string; input: WaypointInput }) => reviere.createWaypoint(revierId, input),
      onSuccess,
    }),
    updateWaypoint: useMutation({
      mutationFn: ({ waypointId, input }: { waypointId: string; input: WaypointInput }) => reviere.updateWaypoint(waypointId, input),
      onSuccess,
    }),
    removeWaypoint: useMutation({ mutationFn: (waypointId: string) => reviere.removeWaypoint(waypointId), onSuccess }),
  };
}
