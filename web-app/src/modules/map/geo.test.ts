import { describe, expect, it } from 'vitest';
import { areaHectares, bboxOf, BoundaryImportError, parseBoundaryFile, polygonFromPoints } from './geo';
import { nrwDopUrl } from './layers';

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Revier</name>
<Polygon><outerBoundaryIs><LinearRing><coordinates>
7.24,51.16,0 7.26,51.16,0 7.26,51.18,0 7.24,51.18,0 7.24,51.16,0
</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`;

const GPX = `<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>Grenzgang</name><trkseg>
<trkpt lat="51.16" lon="7.24"/><trkpt lat="51.16" lon="7.26"/><trkpt lat="51.18" lon="7.26"/><trkpt lat="51.18" lon="7.24"/>
</trkseg></trk></gpx>`;

describe('Reviergrenzen importieren', () => {
  it('liest ein Polygon aus KML', () => {
    const g = parseBoundaryFile('revier.KML', KML);
    expect(g.type).toBe('MultiPolygon');
    expect(g.coordinates[0]![0]).toHaveLength(5);
  });

  it('schließt einen GPX-Track zu einer Fläche', () => {
    const ring = parseBoundaryFile('grenzgang.gpx', GPX).coordinates[0]![0]!;
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
  });

  it('akzeptiert GeoJSON als Geometrie, Feature und FeatureCollection', () => {
    const polygon = { type: 'Polygon', coordinates: [[[7.24, 51.16], [7.26, 51.16], [7.25, 51.18]]] };
    expect(parseBoundaryFile('a.geojson', JSON.stringify(polygon)).coordinates[0]![0]).toHaveLength(4);
    expect(parseBoundaryFile('a.json', JSON.stringify({ type: 'Feature', properties: {}, geometry: polygon })).coordinates).toHaveLength(1);
    const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: polygon }, { type: 'Feature', properties: {}, geometry: polygon }] };
    expect(parseBoundaryFile('a.geojson', JSON.stringify(fc)).coordinates).toHaveLength(2);
  });

  it('meldet Dateien ohne Fläche oder mit kaputtem Inhalt verständlich', () => {
    expect(() => parseBoundaryFile('a.geojson', '{"type":"Point","coordinates":[7,51]}')).toThrow(BoundaryImportError);
    expect(() => parseBoundaryFile('a.geojson', 'kein json')).toThrow('kein gültiges GeoJSON');
    expect(() => parseBoundaryFile('a.kml', '<kml><oops')).toThrow(BoundaryImportError);
  });
});

describe('Geo-Hilfen', () => {
  it('schließt gezeichnete Punkte zu einem Polygon', () => {
    expect(polygonFromPoints([[7, 51], [7.1, 51]])).toBeNull();
    expect(polygonFromPoints([[7, 51], [7.1, 51], [7.1, 51.1]])?.coordinates[0]).toEqual([[7, 51], [7.1, 51], [7.1, 51.1], [7, 51]]);
  });

  it('berechnet Ausschnitt und Fläche', () => {
    const square = parseBoundaryFile('a.kml', KML);
    expect(bboxOf([square, [7.3, 51.2]])).toEqual({ west: 7.24, south: 51.16, east: 7.3, north: 51.2 });
    expect(bboxOf([])).toBeNull();
    // 0,02° × 0,02° bei 51° Breite ≈ 1,40 km × 2,22 km ≈ 311 ha
    expect(areaHectares(square)).toBeGreaterThan(300);
    expect(areaHectares(square)).toBeLessThan(320);
  });

  it('rechnet Zoomstufen in die Matrix von Geobasis NRW um', () => {
    expect(nrwDopUrl(16, 34000, 21900)).toMatch(/EPSG_3857_16\/11\/34000\/21900$/);
  });
});
