// Reine Geo-Hilfsfunktionen (ohne Karte), damit sie ohne Browser getestet werden können.
import { gpx, kml } from '@tmcw/togeojson';
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon, Position } from 'geojson';

export interface Bbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Kartenmittelpunkt des Reviers (wie `AppConstants.defaultMapCenter` in der Flutter-App). */
export const DEFAULT_CENTER = { lat: 51.16868205981034, lng: 7.24749484403816 };

/** Umgebendes Rechteck beliebiger Geometrien und Punkte, `null` ohne Koordinaten. */
export function bboxOf(items: (Geometry | Position | null | undefined)[]): Bbox | null {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  const visit = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      west = Math.min(west, c[0]);
      east = Math.max(east, c[0]);
      south = Math.min(south, c[1]);
      north = Math.max(north, c[1]);
    } else if (Array.isArray(c)) c.forEach(visit);
  };
  for (const item of items) {
    if (!item) continue;
    if (Array.isArray(item)) visit(item);
    else if (item.type === 'GeometryCollection') {
      const inner = bboxOf(item.geometries);
      if (inner) visit([[inner.west, inner.south], [inner.east, inner.north]]);
    } else visit(item.coordinates);
  }
  return Number.isFinite(west) ? { west, south, east, north } : null;
}

const closeRing = (ring: Position[]): Position[] => {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last) return ring;
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
};

const to2d = (p: Position): Position => [Number(p[0]!.toFixed(7)), Number(p[1]!.toFixed(7))];

/** Gezeichnete Eckpunkte (lng/lat) als geschlossenes Polygon, `null` bei weniger als 3 Punkten. */
export function polygonFromPoints(points: Position[]): Polygon | null {
  if (points.length < 3) return null;
  return { type: 'Polygon', coordinates: [closeRing(points.map(to2d))] };
}

export class BoundaryImportError extends Error {}

/** Liest KML, GPX oder GeoJSON (anhand der Dateiendung) als FeatureCollection. */
export function featuresFromText(fileName: string, text: string): FeatureCollection {
  const name = fileName.toLowerCase();
  if (name.endsWith('.kml') || name.endsWith('.gpx')) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) throw new BoundaryImportError('Die Datei ist keine gültige KML- oder GPX-Datei.');
    return (name.endsWith('.gpx') ? gpx(doc) : kml(doc)) as FeatureCollection;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BoundaryImportError('Die Datei ist kein gültiges GeoJSON.');
  }
  return toCollection(json);
}

/** Wie featuresFromText, liest zusätzlich KMZ (gezipptes KML, Standard-Export von Google My Maps). */
export async function featuresFromFile(file: Pick<File, 'name' | 'text' | 'arrayBuffer'>): Promise<FeatureCollection> {
  if (!file.name.toLowerCase().endsWith('.kmz')) return featuresFromText(file.name, await file.text());
  const kmlText = await kmlFromKmz(new Uint8Array(await file.arrayBuffer()));
  return featuresFromText('doc.kml', kmlText);
}

const streamOf = (data: Uint8Array<ArrayBuffer>) =>
  new ReadableStream<BufferSource>({
    start(c) {
      c.enqueue(data);
      c.close();
    },
  });

/** Erste .kml-Datei aus einem KMZ-Archiv (ZIP, gespeichert oder Deflate). */
export async function kmlFromKmz(bytes: Uint8Array): Promise<string> {
  const broken = () => new BoundaryImportError('Die KMZ-Datei konnte nicht gelesen werden. Exportiere die Karte bitte als KML.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw broken();
  const entries = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  for (let n = 0; n < entries; n++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) throw broken();
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const entryName = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!entryName.toLowerCase().endsWith('.kml')) continue;
    if (view.getUint32(local, true) !== 0x04034b50) throw broken();
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.slice(start, start + size);
    if (method === 0) return decoder.decode(data);
    if (method !== 8 || typeof DecompressionStream === 'undefined') throw broken();
    try {
      const stream = streamOf(data).pipeThrough(new DecompressionStream('deflate-raw'));
      return await new Response(stream).text();
    } catch {
      throw broken();
    }
  }
  throw new BoundaryImportError('In der KMZ-Datei ist keine KML-Datei enthalten.');
}

/**
 * Liest eine Reviergrenze aus GeoJSON, KML oder GPX. Polygone werden übernommen, geschlossene
 * oder offene Linien (z. B. ein abgelaufener GPX-Track) werden zu einem Polygon geschlossen.
 * Die endgültige Prüfung und Reparatur übernimmt die Datenbank (Migration 0009).
 */
export function parseBoundaryFile(fileName: string, text: string): MultiPolygon {
  const boundary = boundaryFromFeatures(featuresFromText(fileName, text), { closeLines: true });
  if (!boundary) throw new BoundaryImportError('In der Datei wurde keine Fläche gefunden (Polygon oder geschlossene Linie).');
  return boundary;
}

/**
 * Alle Flächen einer FeatureCollection als ein MultiPolygon, `null` ohne Fläche.
 * Mit `closeLines` werden auch Linien zu Flächen geschlossen.
 */
export function boundaryFromFeatures(fc: FeatureCollection, { closeLines = false } = {}): MultiPolygon | null {
  const polygons: Position[][][] = [];
  const add = (g: Geometry | null) => {
    if (!g) return;
    switch (g.type) {
      case 'Polygon':
        polygons.push(g.coordinates.map((r) => closeRing(r.map(to2d))));
        break;
      case 'MultiPolygon':
        g.coordinates.forEach((p) => polygons.push(p.map((r) => closeRing(r.map(to2d)))));
        break;
      case 'LineString':
        if (closeLines && g.coordinates.length >= 3) polygons.push([closeRing(g.coordinates.map(to2d))]);
        break;
      case 'MultiLineString':
        if (closeLines) g.coordinates.forEach((l) => l.length >= 3 && polygons.push([closeRing(l.map(to2d))]));
        break;
      case 'GeometryCollection':
        g.geometries.forEach(add);
        break;
    }
  };
  fc.features.forEach((f) => add(f.geometry));
  return polygons.length > 0 ? { type: 'MultiPolygon', coordinates: polygons } : null;
}

function toCollection(json: unknown): FeatureCollection {
  const obj = json as { type?: string };
  if (obj?.type === 'FeatureCollection') return json as FeatureCollection;
  if (obj?.type === 'Feature') return { type: 'FeatureCollection', features: [json as Feature] };
  if (typeof obj?.type === 'string') return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: json as Geometry }] };
  throw new BoundaryImportError('Die Datei ist kein gültiges GeoJSON.');
}

/** Fläche in Hektar (sphärische Näherung, genügt für die Anzeige). */
export function areaHectares(g: Polygon | MultiPolygon): number {
  const R = 6378137;
  const ringArea = (ring: Position[]) => {
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i]!;
      const [x2, y2] = ring[i + 1]!;
      sum += ((x2! - x1!) * Math.PI) / 180 * (2 + Math.sin((y1! * Math.PI) / 180) + Math.sin((y2! * Math.PI) / 180));
    }
    return Math.abs((sum * R * R) / 2);
  };
  const polyArea = (p: Position[][]) => p.reduce((a, r, i) => (i === 0 ? a + ringArea(r) : a - ringArea(r)), 0);
  const total = g.type === 'Polygon' ? polyArea(g.coordinates) : g.coordinates.reduce((a, p) => a + polyArea(p), 0);
  return total / 10000;
}

// ------------------------------------------------------------ Kacheln

export function lonToTileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

export function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * 2 ** z);
}

/** Alle Kacheln, die das Gebiet zwischen minZoom und maxZoom abdecken. */
export function tilesForBbox(bbox: Bbox, minZoom: number, maxZoom: number): { z: number; x: number; y: number }[] {
  const tiles: { z: number; x: number; y: number }[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const x0 = lonToTileX(bbox.west, z);
    const x1 = lonToTileX(bbox.east, z);
    const y0 = latToTileY(bbox.north, z);
    const y1 = latToTileY(bbox.south, z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tiles.push({ z, x, y });
  }
  return tiles;
}

export function countTiles(bbox: Bbox, minZoom: number, maxZoom: number): number {
  let n = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    n += (lonToTileX(bbox.east, z) - lonToTileX(bbox.west, z) + 1) * (latToTileY(bbox.south, z) - latToTileY(bbox.north, z) + 1);
  }
  return n;
}

/** Rechteck um `meters` in jede Richtung vergrößern (Rand ums Revier, z. B. für Nachsuchen). */
export function padBbox(b: Bbox, meters: number): Bbox {
  const dLat = meters / 111_320;
  const dLng = meters / (111_320 * Math.cos((((b.north + b.south) / 2) * Math.PI) / 180));
  return { west: b.west - dLng, south: b.south - dLat, east: b.east + dLng, north: b.north + dLat };
}
