import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, check, guard, unwrap } from '../../lib/errors';
import {
  REVIER_COLUMNS,
  WAYPOINT_COLUMNS,
  revierFromRow,
  sortReviere,
  waypointFromRow,
  type Boundary,
  type Revier,
  type RevierBoundary,
  type RevierRow,
  type Waypoint,
  type WaypointInput,
  type WaypointRow,
} from './revierModel';

/** Port von ReviereRepository (Flutter), ergänzt um Grenzen und Einrichtungen. */
export interface ReviereService {
  /** Alle Reviere aller eigenen Gruppen (RLS filtert). */
  all(): Promise<Revier[]>;
  forGroup(groupId: string): Promise<Revier[]>;
  get(revierId: string): Promise<Revier>;
  create(input: { groupId: string; name: string; description: string }): Promise<Revier>;
  update(revierId: string, input: { name: string; description: string }): Promise<void>;
  remove(revierId: string): Promise<void>;
  /** Grenzen der angegebenen Reviere. */
  boundaries(revierIds: string[]): Promise<RevierBoundary[]>;
  saveBoundary(revierId: string, geometry: Boundary): Promise<void>;
  removeBoundary(revierId: string): Promise<void>;
  waypoints(revierIds: string[]): Promise<Waypoint[]>;
  createWaypoint(revierId: string, input: WaypointInput): Promise<Waypoint>;
  updateWaypoint(waypointId: string, input: WaypointInput): Promise<void>;
  removeWaypoint(waypointId: string): Promise<void>;
}

const FORBIDDEN = () => new AppError('Dafür fehlen dir die Berechtigungen.', 'forbidden');

const waypointRow = (w: WaypointInput) => ({
  name: w.name.trim(),
  description: w.description.trim(),
  category: w.category,
  latitude: w.lat,
  longitude: w.lng,
});

export function createSupabaseReviereService(client: SupabaseClient): ReviereService {
  return {
    all: () =>
      guard(async () => sortReviere(unwrap(await client.from('reviere').select(REVIER_COLUMNS).returns<RevierRow[]>()).map(revierFromRow))),
    forGroup: (groupId) =>
      guard(async () =>
        sortReviere(unwrap(await client.from('reviere').select(REVIER_COLUMNS).eq('group_id', groupId).returns<RevierRow[]>()).map(revierFromRow)),
      ),
    get: (revierId) =>
      guard(async () => {
        const row = unwrap(await client.from('reviere').select(REVIER_COLUMNS).eq('id', revierId).maybeSingle<RevierRow>());
        if (!row) throw new AppError('Dieses Revier existiert nicht oder du hast keinen Zugriff.', 'notFound');
        return revierFromRow(row);
      }),
    create: ({ groupId, name, description }) =>
      guard(async () => {
        const row = unwrap(
          await client
            .from('reviere')
            .insert({ group_id: groupId, name: name.trim(), description: description.trim() })
            .select(REVIER_COLUMNS)
            .single<RevierRow>(),
        );
        return revierFromRow(row);
      }),
    update: (revierId, { name, description }) =>
      guard(async () => {
        const rows = unwrap(await client.from('reviere').update({ name: name.trim(), description: description.trim() }).eq('id', revierId).select('id'));
        if (rows.length === 0) throw FORBIDDEN();
      }),
    remove: (revierId) =>
      guard(async () => {
        const rows = unwrap(await client.from('reviere').delete().eq('id', revierId).select('id'));
        if (rows.length === 0) throw FORBIDDEN();
      }),
    boundaries: (revierIds) =>
      guard(async () => {
        if (revierIds.length === 0) return [];
        const rows = unwrap(
          await client
            .from('revier_boundaries')
            .select('id, revier_id, boundary_data')
            .in('revier_id', revierIds)
            .returns<{ id: string; revier_id: string; boundary_data: Boundary }[]>(),
        );
        return rows.map((r) => ({ id: r.id, revierId: r.revier_id, geometry: r.boundary_data }));
      }),
    saveBoundary: (revierId, geometry) =>
      guard(async () => {
        // Ein Revier hat eine Grenze: vorhandene Zeile aktualisieren, sonst anlegen.
        const existing = unwrap(await client.from('revier_boundaries').select('id').eq('revier_id', revierId).limit(1));
        const first = existing[0];
        if (first) {
          const rows = unwrap(await client.from('revier_boundaries').update({ boundary_data: geometry }).eq('id', first.id).select('id'));
          if (rows.length === 0) throw FORBIDDEN();
        } else {
          check(await client.from('revier_boundaries').insert({ revier_id: revierId, boundary_data: geometry }));
        }
      }),
    removeBoundary: (revierId) =>
      guard(async () => {
        check(await client.from('revier_boundaries').delete().eq('revier_id', revierId));
      }),
    waypoints: (revierIds) =>
      guard(async () => {
        if (revierIds.length === 0) return [];
        const rows = unwrap(await client.from('waypoints').select(WAYPOINT_COLUMNS).in('revier_id', revierIds).returns<WaypointRow[]>());
        return rows.map(waypointFromRow).sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
      }),
    createWaypoint: (revierId, input) =>
      guard(async () =>
        waypointFromRow(
          unwrap(await client.from('waypoints').insert({ revier_id: revierId, ...waypointRow(input) }).select(WAYPOINT_COLUMNS).single<WaypointRow>()),
        ),
      ),
    updateWaypoint: (waypointId, input) =>
      guard(async () => {
        const rows = unwrap(await client.from('waypoints').update(waypointRow(input)).eq('id', waypointId).select('id'));
        if (rows.length === 0) throw FORBIDDEN();
      }),
    removeWaypoint: (waypointId) =>
      guard(async () => {
        const rows = unwrap(await client.from('waypoints').delete().eq('id', waypointId).select('id'));
        if (rows.length === 0) throw FORBIDDEN();
      }),
  };
}
