// Karten-Import in eine Jagd: Flächen werden Zonen, Punkte werden Stände.
// Typische Quelle ist eine in Google My Maps oder Google Earth gezeichnete Karte (KML/KMZ).
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon, Position } from 'geojson';
import { BoundaryImportError, bboxOf, type Bbox } from '../../modules/map/geo';
import type { ZoneKind } from './huntModel';
import type { WaypointCategory } from '../reviere/revierModel';

export interface ImportZone {
  key: string;
  name: string;
  kind: ZoneKind;
  /** Farbe aus der Datei (#rrggbb), sonst die Farbe der Zonenart. */
  color: string | null;
  geometry: Polygon | MultiPolygon;
}

export interface ImportStand {
  key: string;
  label: string;
  lat: number;
  lng: number;
  /** Aus dem Namen geraten (z. B. „Treffpunkt“ → Sammelplatz), null = Stand. */
  category: WaypointCategory | null;
  /** Gibt es in der Jagd (oder weiter oben in der Datei) schon. */
  duplicate: boolean;
}

export interface HuntImport {
  zones: ImportZone[];
  stands: ImportStand[];
}

const MAX_ZONE_NAME = 120;
const MAX_STAND_LABEL = 60;

const round = (n: number) => Number(n.toFixed(7));
const to2d = (p: Position): Position => [round(p[0]!), round(p[1]!)];
const closeRing = (ring: Position[]) => {
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first && last && (first[0] !== last[0] || first[1] !== last[1]) ? [...ring, first] : ring;
};
const cleanPolygon = (rings: Position[][]) => rings.map((r) => closeRing(r.map(to2d))).filter((r) => r.length >= 4);

const clean = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
const cut = (s: string, max: number) => (s.length > max ? s.slice(0, max).trimEnd() : s);
const hexColor = (c: unknown) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null);

/** Zonenart aus dem Namen raten; der Jagdleiter kann sie vor dem Speichern ändern. */
export function guessZoneKind(name: string): ZoneKind {
  const n = name.toLowerCase();
  if (/sicherheit/.test(n)) return 'sicherheitszone';
  if (/sperr|tabu|ruhe/.test(n)) return 'sperrzone';
  if (/sammel|treffpunkt|parkplatz|streckenplatz/.test(n)) return 'sammelplatz';
  if (/karte|revier|grenze|gesamt|übersicht|uebersicht/.test(n)) return 'sonstiges';
  return 'treiben';
}

/** Art eines Punktes aus dem Namen raten; null = einfacher Stand. */
export function guessPointCategory(name: string): WaypointCategory | null {
  const n = name.toLowerCase();
  if (/treffpunkt|sammel|streckenplatz|strecke legen/.test(n)) return 'sammelplatz';
  if (/parkplatz|parken/.test(n)) return 'parkplatz';
  if (/kanzel/.test(n)) return 'kanzel';
  if (/\bdjb\b|drückjagdbock|drueckjagdbock|\bbock\b/.test(n)) return 'drueckjagdbock';
  if (/leiter/.test(n)) return 'ansitzleiter';
  if (/hochsitz|\bhs\b/.test(n)) return 'hochsitz';
  if (/gefahr|achtung|vorsicht/.test(n)) return 'gefahr';
  return null;
}

const contains = (outer: Bbox, inner: Bbox) => outer.west <= inner.west && outer.east >= inner.east && outer.south <= inner.south && outer.north >= inner.north;

/**
 * Zonen und Stände aus einer FeatureCollection (siehe featuresFromFile).
 * Flächen werden Zonen, Punkte Stände; Linien und anderes werden übergangen.
 */
export function huntImportFrom(fc: FeatureCollection, existingStandLabels: string[] = []): HuntImport {
  const zones: ImportZone[] = [];
  const stands: ImportStand[] = [];
  const taken = new Set(existingStandLabels.map((l) => l.trim().toLowerCase()));

  const visit = (f: Feature, g: Geometry | null, i: string) => {
    if (!g) return;
    const name = clean(f.properties?.name);
    switch (g.type) {
      case 'Polygon':
      case 'MultiPolygon': {
        const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map(cleanPolygon).filter((p) => p.length > 0);
        if (polys.length === 0) return;
        const zoneName = cut(name || `Zone ${zones.length + 1}`, MAX_ZONE_NAME);
        zones.push({
          key: `z${i}`,
          name: zoneName,
          kind: guessZoneKind(zoneName),
          color: hexColor(f.properties?.fill) ?? hexColor(f.properties?.stroke),
          geometry: polys.length === 1 ? { type: 'Polygon', coordinates: polys[0]! } : { type: 'MultiPolygon', coordinates: polys },
        });
        return;
      }
      case 'Point': {
        const [lng, lat] = g.coordinates;
        if (typeof lng !== 'number' || typeof lat !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
        const label = cut(name || `Stand ${stands.length + 1}`, MAX_STAND_LABEL);
        const duplicate = taken.has(label.toLowerCase());
        taken.add(label.toLowerCase());
        stands.push({ key: `s${i}`, label, lat: round(lat), lng: round(lng), category: guessPointCategory(label), duplicate });
        return;
      }
      case 'MultiPoint':
        g.coordinates.forEach((c, j) => visit({ ...f, properties: { ...f.properties, name: name ? `${name} ${j + 1}` : '' } }, { type: 'Point', coordinates: c }, `${i}-${j}`));
        return;
      case 'GeometryCollection':
        g.geometries.forEach((inner, j) => visit(f, inner, `${i}-${j}`));
        return;
      default:
        return;
    }
  };
  fc.features.forEach((f, i) => visit(f, f.geometry, String(i)));

  // Eine Fläche, die alle anderen umschließt, ist meist das ganze Jagdgebiet, kein Treiben.
  if (zones.length > 1) {
    const boxes = zones.map((z) => bboxOf([z.geometry])!);
    zones.forEach((z, i) => {
      if (z.kind === 'treiben' && boxes.every((b, j) => j === i || contains(boxes[i]!, b))) z.kind = 'sonstiges';
    });
  }

  if (zones.length === 0 && stands.length === 0) throw new BoundaryImportError('In der Datei wurden weder Flächen noch Punkte gefunden.');
  return { zones, stands };
}
