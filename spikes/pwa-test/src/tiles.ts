// Kachel-Mathematik und Kartenquellen für den Offline-Test.
// Reine Funktionen, damit sie ohne Browser getestet werden können.

export type LayerId = 'karte' | 'luftbild';

export interface Bbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface Tile {
  z: number;
  x: number;
  y: number;
}

/** Kartenmittelpunkt des Reviers (wie `AppConstants.defaultMapCenter` in der Flutter-App). */
export const DEFAULT_CENTER = { lat: 51.16868205981034, lon: 7.24749484403816 };

/** Standard-Testgebiet: ca. 4 x 5,5 km um den Mittelpunkt, solange keine KML geladen ist. */
export const DEFAULT_BBOX: Bbox = {
  west: DEFAULT_CENTER.lon - 0.03,
  south: DEFAULT_CENTER.lat - 0.02,
  east: DEFAULT_CENTER.lon + 0.03,
  north: DEFAULT_CENTER.lat + 0.02,
};

export const LAYERS: Record<LayerId, { label: string; maxzoom: number; attribution: string }> = {
  karte: {
    label: 'Karte (basemap.de)',
    maxzoom: 18,
    attribution: '© GeoBasis-DE / BKG (CC BY 4.0)',
  },
  luftbild: {
    label: 'Luftbild (Geobasis NRW)',
    maxzoom: 19,
    attribution: '© Geobasis NRW (dl-de/zero-2-0)',
  },
};

/** Echte Kachel-URL beim Anbieter. */
export function tileUrl(layer: LayerId, { z, x, y }: Tile): string {
  if (layer === 'karte') {
    // basemap.de WMTS, Reihenfolge {z}/{y}/{x}
    return `https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_farbe/default/GLOBAL_WEBMERCATOR/${z}/${y}/${x}.png`;
  }
  // Geobasis NRW DOP: Matrix "00" entspricht Web-Mercator-Zoom 5.
  const level = String(z - 5).padStart(2, '0');
  return `https://www.wmts.nrw.de/geobasis/wmts_nw_dop/tiles/nw_dop/EPSG_3857_16/${level}/${x}/${y}`;
}

export function lonToTileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

export function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * 2 ** z);
}

/** Alle Kacheln, die das Gebiet zwischen minZoom und maxZoom abdecken. */
export function tilesForBbox(bbox: Bbox, minZoom: number, maxZoom: number): Tile[] {
  const tiles: Tile[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const x0 = lonToTileX(bbox.west, z);
    const x1 = lonToTileX(bbox.east, z);
    const y0 = latToTileY(bbox.north, z);
    const y1 = latToTileY(bbox.south, z);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) tiles.push({ z, x, y });
    }
  }
  return tiles;
}

/** Umgebendes Rechteck einer GeoJSON-FeatureCollection, `null` ohne Koordinaten. */
export function bboxOf(geojson: GeoJSON.FeatureCollection): Bbox | null {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  const visit = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      west = Math.min(west, c[0]); east = Math.max(east, c[0]);
      south = Math.min(south, c[1]); north = Math.max(north, c[1]);
    } else if (Array.isArray(c)) {
      c.forEach(visit);
    }
  };
  for (const f of geojson.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'GeometryCollection') g.geometries.forEach((gg) => 'coordinates' in gg && visit(gg.coordinates));
    else visit(g.coordinates);
  }
  return Number.isFinite(west) ? { west, south, east, north } : null;
}

/** Gebiet um einen Rand in Grad erweitern (damit der Rand nicht abgeschnitten ist). */
export function padBbox(b: Bbox, deg = 0.005): Bbox {
  return { west: b.west - deg, south: b.south - deg, east: b.east + deg, north: b.north + deg };
}
