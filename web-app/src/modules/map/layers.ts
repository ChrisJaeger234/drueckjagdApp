import type { StyleSpecification } from 'maplibre-gl';

// Offene Kartendaten ohne Schlüssel (siehe Architekturbericht). Beide Kartentypen laufen über ein
// eigenes Protokoll, damit Kacheln aus einem Offline-Paket (tileStore.ts) zuerst gelesen werden.
export type LayerId = 'karte' | 'luftbild';

export const LAYER_IDS: LayerId[] = ['karte', 'luftbild'];

export const LAYERS: Record<LayerId, { label: string; protocol: string; minzoom: number; maxzoom: number; attribution: string; avgTileBytes: number }> = {
  karte: {
    label: 'Karte',
    protocol: 'basemap',
    minzoom: 0,
    maxzoom: 18,
    attribution: '© GeoBasis-DE / BKG (CC BY 4.0)',
    // Erfahrungswerte aus dem Spike (Phase 0) für die Größenschätzung.
    avgTileBytes: 15_000,
  },
  luftbild: {
    label: 'Luftbild',
    protocol: 'nrwdop',
    minzoom: 5,
    maxzoom: 19,
    attribution: '© Geobasis NRW (dl-de/zero-2-0)',
    avgTileBytes: 28_000,
  },
};

export interface Tile {
  z: number;
  x: number;
  y: number;
}

/** Echte Kachel-URL beim Anbieter. */
export function tileUrl(layer: LayerId, { z, x, y }: Tile): string {
  if (layer === 'karte') {
    // basemap.de WMTS, Reihenfolge {z}/{y}/{x}
    return `https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_farbe/default/GLOBAL_WEBMERCATOR/${z}/${y}/${x}.png`;
  }
  return nrwDopUrl(z, x, y);
}

export function nrwDopUrl(z: number, x: number, y: number): string {
  // Geobasis NRW DOP: Matrix "00" entspricht Web-Mercator-Zoom 5.
  return `https://www.wmts.nrw.de/geobasis/wmts_nw_dop/tiles/nw_dop/EPSG_3857_16/${String(z - 5).padStart(2, '0')}/${x}/${y}`;
}

/** Liest `basemap://z/x/y` bzw. `nrwdop://z/x/y`. */
export function parseProtocolUrl(url: string): { layer: LayerId; tile: Tile } | null {
  const m = /^(\w+):\/\/(\d+)\/(\d+)\/(\d+)$/.exec(url);
  if (!m) return null;
  const layer = LAYER_IDS.find((id) => LAYERS[id].protocol === m[1]);
  return layer ? { layer, tile: { z: Number(m[2]), x: Number(m[3]), y: Number(m[4]) } } : null;
}

export function baseStyle(layer: LayerId): StyleSpecification {
  const l = LAYERS[layer];
  return {
    version: 8,
    sources: {
      base: { type: 'raster', tiles: [`${l.protocol}://{z}/{x}/{y}`], tileSize: 256, maxzoom: l.maxzoom, minzoom: l.minzoom, attribution: l.attribution },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#e8e4d8' } },
      { id: 'base', type: 'raster', source: 'base' },
    ],
  };
}
