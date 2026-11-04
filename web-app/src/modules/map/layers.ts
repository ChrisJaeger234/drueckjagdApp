import type { StyleSpecification } from 'maplibre-gl';

// Offene Kartendaten ohne Schlüssel (siehe Architekturbericht). Offline-Pakete folgen in Phase 7.
export type LayerId = 'karte' | 'luftbild';

export const LAYERS: Record<LayerId, { label: string; tiles: string; maxzoom: number; attribution: string }> = {
  karte: {
    label: 'Karte',
    tiles: 'https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_farbe/default/GLOBAL_WEBMERCATOR/{z}/{y}/{x}.png',
    maxzoom: 18,
    attribution: '© GeoBasis-DE / BKG (CC BY 4.0)',
  },
  luftbild: {
    label: 'Luftbild',
    // Geobasis NRW DOP über das Protokoll nrwdop:// (Matrix "00" entspricht Zoom 5).
    tiles: 'nrwdop://{z}/{x}/{y}',
    maxzoom: 19,
    attribution: '© Geobasis NRW (dl-de/zero-2-0)',
  },
};

export function nrwDopUrl(z: number, x: number, y: number): string {
  return `https://www.wmts.nrw.de/geobasis/wmts_nw_dop/tiles/nw_dop/EPSG_3857_16/${String(z - 5).padStart(2, '0')}/${x}/${y}`;
}

export function baseStyle(layer: LayerId): StyleSpecification {
  const l = LAYERS[layer];
  return {
    version: 8,
    sources: {
      base: { type: 'raster', tiles: [l.tiles], tileSize: 256, maxzoom: l.maxzoom, minzoom: layer === 'luftbild' ? 5 : 0, attribution: l.attribution },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#e8e4d8' } },
      { id: 'base', type: 'raster', source: 'base' },
    ],
  };
}
