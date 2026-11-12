// Revier aus einer Karten-Datei füllen: Flächen werden die Reviergrenze, Punkte werden Einrichtungen.
// Typische Quelle ist der KML-Export der App „Jagdbegleiter“ (nature-software.com): Der Typ einer
// Einrichtung steckt dort nur im Dateinamen des Symbols, z. B. …/symbols/Saukanzel.png.
import type { Feature, FeatureCollection, Geometry, MultiPolygon } from 'geojson';
import { boundaryFromFeatures, BoundaryImportError } from '../../modules/map/geo';
import { guessPointCategory } from '../hunts/huntImport';
import { CATEGORY_LABEL, type Waypoint, type WaypointCategory } from './revierModel';

export type ImportAction = 'new' | 'update' | 'same';

export interface ImportWaypoint {
  key: string;
  name: string;
  description: string;
  category: WaypointCategory;
  lat: number;
  lng: number;
  /** new = neu anlegen, update = vorhandene Einrichtung ändern, same = unverändert vorhanden. */
  action: ImportAction;
  /** Vorhandene Einrichtung bei update/same. */
  existingId: string | null;
  /** Der Punkt hatte in der Datei keinen Namen. */
  generatedName: boolean;
}

export interface RevierImport {
  boundary: MultiPolygon | null;
  waypoints: ImportWaypoint[];
}

const MAX_NAME = 120;
const MAX_DESCRIPTION = 2000;
/** Bis zu diesem Abstand gilt ein Punkt als dieselbe Einrichtung. */
const SAME_PLACE_M = 5;

/** Symbolnamen (ohne Endung und Ziffern, klein) aus Jagdbegleiter und ähnlichen Apps. */
const ICON_CATEGORY: Record<string, WaypointCategory> = {
  kanzel: 'kanzel',
  saukanzel: 'kanzel',
  fahrbare: 'fahrbare_kanzel',
  fahrbarekanzel: 'fahrbare_kanzel',
  drueckjagdbock: 'drueckjagdbock',
  drückjagdbock: 'drueckjagdbock',
  bock: 'drueckjagdbock',
  eisensitz: 'ansitzleiter',
  leitersitz: 'ansitzleiter',
  leiter: 'ansitzleiter',
  ansitzleiter: 'ansitzleiter',
  bodensitz: 'hochsitz',
  hochsitz: 'hochsitz',
  ansitz: 'hochsitz',
  feeder: 'kirrung',
  kirrung: 'kirrung',
  fuetterung: 'fuetterung',
  fütterung: 'fuetterung',
  futterstelle: 'fuetterung',
  salzlecke: 'salzlecke',
  lecke: 'salzlecke',
  suhle: 'suhle',
  wildacker: 'wildacker',
  kamera: 'wildkamera',
  camera: 'wildkamera',
  wildkamera: 'wildkamera',
  parkplatz: 'parkplatz',
  treffpunkt: 'sammelplatz',
  sammelplatz: 'sammelplatz',
  gefahr: 'gefahr',
};

/** Kategorie aus der Symbol-Adresse, `null` wenn unbekannt. */
export function categoryFromIcon(href: unknown): WaypointCategory | null {
  if (typeof href !== 'string') return null;
  const file = href.split(/[/\\]/).pop() ?? '';
  const base = file.replace(/\.[a-z0-9]+$/i, '').replace(/[\d_\-\s]+$/, '').toLowerCase();
  return ICON_CATEGORY[base] ?? null;
}

/** Kategorie aus dem Namen; ergänzt guessPointCategory um Reviereinrichtungen. */
function categoryFromName(name: string): WaypointCategory | null {
  const n = name.toLowerCase();
  if (/kirrung/.test(n)) return 'kirrung';
  if (/salzlecke|minerallecke|lecke/.test(n)) return 'salzlecke';
  if (/f(ü|ue)tterung/.test(n)) return 'fuetterung';
  if (/\bcam\b|kamera/.test(n)) return 'wildkamera';
  if (/wildacker/.test(n)) return 'wildacker';
  if (/fahrbar/.test(n)) return 'fahrbare_kanzel';
  return guessPointCategory(name);
}

/** Sitze und Stände: Nennt der Name eine dieser Arten, gilt der Name vor dem Symbol (z. B. „DJB 3“ mit Kanzel-Symbol). */
const STAND_TYPES = new Set<WaypointCategory>(['hochsitz', 'kanzel', 'fahrbare_kanzel', 'drueckjagdbock', 'ansitzleiter']);

/** Art eines Punktes: Sitzart aus dem Namen, sonst Symbol, sonst Name, sonst Sonstiges. */
export function importCategory(name: string, icon: unknown): WaypointCategory {
  const byName = name ? categoryFromName(name) : null;
  if (byName && STAND_TYPES.has(byName)) return byName;
  return categoryFromIcon(icon) ?? byName ?? 'sonstiges';
}

const clean = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
const cut = (s: string, max: number) => (s.length > max ? s.slice(0, max).trimEnd() : s);
const round = (n: number) => Number(n.toFixed(7));

function descriptionOf(value: unknown): string {
  const raw = typeof value === 'string' ? value : typeof (value as { value?: unknown })?.value === 'string' ? (value as { value: string }).value : '';
  const text = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .trim();
  return cut(text, MAX_DESCRIPTION);
}

/** Abstand in Metern (gleichwinklige Näherung, genügt für wenige Meter). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

const key = (name: string) => name.trim().toLowerCase();

/**
 * Grenze und Einrichtungen aus einer FeatureCollection (siehe featuresFromFile).
 * Vorhandene Einrichtungen werden über den Namen oder – bei Punkten ohne Namen – über die Lage
 * erkannt, damit ein erneuter Import nichts doppelt anlegt.
 */
export function revierImportFrom(fc: FeatureCollection, existing: Waypoint[] = []): RevierImport {
  const boundary = boundaryFromFeatures(fc);
  const points: { f: Feature; lat: number; lng: number; i: string }[] = [];
  const visit = (f: Feature, g: Geometry | null, i: string) => {
    if (!g) return;
    if (g.type === 'Point') {
      const [lng, lat] = g.coordinates;
      if (typeof lng !== 'number' || typeof lat !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
      points.push({ f, lat: round(lat), lng: round(lng), i });
    } else if (g.type === 'MultiPoint') {
      g.coordinates.forEach((c, j) => visit(f, { type: 'Point', coordinates: c }, `${i}-${j}`));
    } else if (g.type === 'GeometryCollection') {
      g.geometries.forEach((inner, j) => visit(f, inner, `${i}-${j}`));
    }
  };
  fc.features.forEach((f, i) => visit(f, f.geometry, String(i)));

  const byName = new Map(existing.map((w) => [key(w.name), w]));
  const claimed = new Set<string>();
  const fileNames = new Set<string>();

  const freeName = (base: string) => {
    if (!fileNames.has(key(base))) return base;
    for (let n = 2; ; n++) {
      const candidate = cut(`${base} (${n})`, MAX_NAME);
      if (!fileNames.has(key(candidate))) return candidate;
    }
  };
  /** Punkte ohne Namen heißen wie ihre Art, z. B. „Wildkamera“ (mehrfach erlaubt). */
  const generatedName = (category: WaypointCategory) => CATEGORY_LABEL[category];

  const waypoints: ImportWaypoint[] = points.map(({ f, lat, lng, i }) => {
    const fileName = cut(clean(f.properties?.name), MAX_NAME);
    const category = importCategory(fileName, f.properties?.icon);
    const description = descriptionOf(f.properties?.description);

    // Vorhandene Einrichtung: gleicher Name, sonst gleiche Art am gleichen Ort.
    let match = fileName && !fileNames.has(key(fileName)) ? byName.get(key(fileName)) : undefined;
    if (match && claimed.has(match.id)) match = undefined;
    if (!match) match = existing.find((w) => !claimed.has(w.id) && w.category === category && distanceM(w, { lat, lng }) <= SAME_PLACE_M);
    if (match) claimed.add(match.id);

    const name = match && !fileName ? match.name : fileName ? freeName(fileName) : generatedName(category);
    if (fileName) fileNames.add(key(name));

    let action: ImportAction = 'new';
    if (match) {
      const unchanged =
        match.name === name && match.category === category && distanceM(match, { lat, lng }) < 0.5 && (description === '' || match.description === description);
      action = unchanged ? 'same' : 'update';
    }
    return {
      key: `p${i}`,
      name,
      // Leere Beschreibung in der Datei überschreibt keine vorhandene.
      description: match && description === '' ? match.description : description,
      category,
      lat,
      lng,
      action,
      existingId: match?.id ?? null,
      generatedName: !fileName,
    };
  });

  if (!boundary && waypoints.length === 0) throw new BoundaryImportError('In der Datei wurden weder Flächen noch Punkte gefunden.');
  return { boundary, waypoints };
}
