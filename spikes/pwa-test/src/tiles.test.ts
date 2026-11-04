import { describe, expect, it } from 'vitest';
import { bboxOf, DEFAULT_BBOX, latToTileY, lonToTileX, tilesForBbox, tileUrl } from './tiles';

describe('Kachel-Mathematik', () => {
  it('rechnet Koordinaten im Revier in Kachelnummern um', () => {
    expect(lonToTileX(7.24, 14)).toBe(8521);
    expect(latToTileY(51.18, 14)).toBe(5471);
  });

  it('zählt die Kacheln des Standardgebiets plausibel', () => {
    const z12 = tilesForBbox(DEFAULT_BBOX, 12, 12);
    expect(z12.length).toBeGreaterThanOrEqual(1);
    expect(z12.length).toBeLessThanOrEqual(4);
    const all = tilesForBbox(DEFAULT_BBOX, 12, 17);
    expect(all.length).toBeGreaterThan(500);
    expect(all.length).toBeLessThan(1500);
  });

  it('versetzt den Zoom für die NRW-Luftbilder um 5 Stufen', () => {
    expect(tileUrl('luftbild', { z: 14, x: 8521, y: 5471 })).toMatch(/EPSG_3857_16\/09\/8521\/5471$/);
    expect(tileUrl('karte', { z: 14, x: 8521, y: 5471 })).toMatch(/GLOBAL_WEBMERCATOR\/14\/5471\/8521\.png$/);
  });

  it('bestimmt das Rechteck einer Reviergrenze', () => {
    const b = bboxOf({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [[[7.2, 51.1], [7.3, 51.1], [7.3, 51.2], [7.2, 51.1]]] },
        },
      ],
    });
    expect(b).toEqual({ west: 7.2, south: 51.1, east: 7.3, north: 51.2 });
  });
});
