// Port von lib/features/hunting_grounds/domain und lib/features/map/domain der Flutter-App.
import type { MultiPolygon, Polygon } from 'geojson';

export interface Revier {
  id: string;
  name: string;
  description: string;
  groupId: string;
  groupName: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export const REVIER_COLUMNS = 'id, name, description, group_id, created_by, created_at, updated_at, group:groups(name)';

export interface RevierRow {
  id: string;
  name: string;
  description: string | null;
  group_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  group?: { name: string } | null;
}

export function revierFromRow(row: RevierRow): Revier {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    groupId: row.group_id,
    groupName: row.group?.name ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const sortReviere = (list: Revier[]) => [...list].sort((a, b) => a.name.localeCompare(b.name, 'de'));

/** Reviergrenze; die Datenbank speichert sie normalisiert als MultiPolygon. */
export type Boundary = Polygon | MultiPolygon;

export interface RevierBoundary {
  id: string;
  revierId: string;
  geometry: Boundary;
}

// ------------------------------------------------------------ Einrichtungen

export const WAYPOINT_CATEGORIES = [
  ['hochsitz', 'Hochsitz'],
  ['kanzel', 'Kanzel geschlossen'],
  ['kanzel_offen', 'Kanzel offen'],
  ['fahrbare_kanzel', 'Fahrbare Kanzel'],
  ['drueckjagdbock', 'Drückjagdbock ohne Dach'],
  ['ansitzleiter', 'Ansitzleiter'],
  ['kirrung', 'Kirrung'],
  ['fuetterung', 'Fütterung'],
  ['salzlecke', 'Salzlecke'],
  ['suhle', 'Suhle'],
  ['wildacker', 'Wildacker'],
  ['wildkamera', 'Wildkamera'],
  ['weg', 'Weg'],
  ['sammelplatz', 'Sammelplatz'],
  ['parkplatz', 'Parkplatz'],
  ['gefahr', 'Gefahr'],
  ['sonstiges', 'Sonstiges'],
] as const;

export type WaypointCategory = (typeof WAYPOINT_CATEGORIES)[number][0];

export const CATEGORY_LABEL = Object.fromEntries(WAYPOINT_CATEGORIES) as Record<WaypointCategory, string>;

/** Unbekannte Werte (neuere Datenbank) werden wie in Flutter als „Sonstiges“ gezeigt. */
export function parseCategory(value: string): WaypointCategory {
  return value in CATEGORY_LABEL ? (value as WaypointCategory) : 'sonstiges';
}

/** Farbgruppen für die Kartenmarker. */
export function categoryColor(c: WaypointCategory): string {
  switch (c) {
    case 'hochsitz':
    case 'kanzel':
    case 'kanzel_offen':
    case 'fahrbare_kanzel':
    case 'drueckjagdbock':
    case 'ansitzleiter':
      return '#7a4a1f';
    case 'kirrung':
    case 'fuetterung':
    case 'salzlecke':
    case 'suhle':
    case 'wildacker':
      return '#4c7a2c';
    case 'sammelplatz':
    case 'parkplatz':
    case 'weg':
      return '#1f5c8a';
    case 'gefahr':
      return '#b3261e';
    default:
      return '#555555';
  }
}

export interface Waypoint {
  id: string;
  revierId: string;
  createdBy: string | null;
  name: string;
  description: string;
  category: WaypointCategory;
  lat: number;
  lng: number;
}

export const WAYPOINT_COLUMNS = 'id, revier_id, created_by, name, description, category, latitude, longitude';

export interface WaypointRow {
  id: string;
  revier_id: string;
  created_by: string | null;
  name: string;
  description: string | null;
  category: string;
  latitude: number;
  longitude: number;
}

export function waypointFromRow(row: WaypointRow): Waypoint {
  return {
    id: row.id,
    revierId: row.revier_id,
    createdBy: row.created_by,
    name: row.name,
    description: row.description ?? '',
    category: parseCategory(row.category),
    lat: row.latitude,
    lng: row.longitude,
  };
}

export interface WaypointInput {
  name: string;
  description: string;
  category: WaypointCategory;
  lat: number;
  lng: number;
}

/** Einrichtungen als Kartenmarker. */
export const waypointMarkers = (list: Waypoint[]) =>
  list.map((w) => ({ id: w.id, lat: w.lat, lng: w.lng, label: w.name, color: categoryColor(w.category), ariaLabel: `${CATEGORY_LABEL[w.category]} ${w.name}` }));
