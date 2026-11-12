import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { featuresFromText } from '../../modules/map/geo';
import { FakeGroups, FakeProfiles, FakeReviere } from '../../test/fakes';
import { renderApp, signedIn } from '../../test/renderApp';
import type { Waypoint } from './revierModel';
import { categoryFromIcon, importCategory, revierImportFrom } from './revierImport';

// Aufgebaut wie der KML-Export der App „Jagdbegleiter“: nur Punkte, Typ im Symbol-Dateinamen.
const pm = (name: string, icon: string, x: number, y: number, desc = '') =>
  `<Placemark><name>${name}</name><Point><coordinates>${x},${y},0</coordinates></Point><description>${desc}</description><Style><IconStyle><Icon><href>http://nature-software.com/images/symbols/${icon}.png</href></Icon></IconStyle></Style><ExtendedData><Data name="Revier"><value>15 Höfe</value></Data></ExtendedData></Placemark>`;
const boundary = `<Placemark><name>Revier 15 Höfe</name><Polygon><outerBoundaryIs><LinearRing><coordinates>7.23,51.15,0 7.27,51.15,0 7.27,51.18,0 7.23,51.18,0 7.23,51.15,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;
const kml = (...placemarks: string[]) => `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${placemarks.join('')}</Document></kml>`;

const JAGDBEGLEITER = kml(
  pm('Kirrung Drei Eichen', 'Feeder', 7.243, 51.166),
  pm('Wäschdiek', 'Saukanzel', 7.24935, 51.1643),
  pm('Drückjagdbock 10 mit Dach', 'Drueckjagdbock2', 7.250071, 51.173195),
  pm('Stahlleiter Birgder Höhe', 'Eisensitz', 7.232881, 51.161563),
  pm('Lorke unten im Wald', 'Bodensitz', 7.253257, 51.169987),
  pm('DJB 3', 'Kanzel', 7.248978, 51.16014),
  pm('Führerbunker', 'Fahrbare', 7.258235, 51.169725),
  pm('', 'Kamera', 7.257483, 51.170258),
  pm('', 'Kamera', 7.258812, 51.154377),
  pm('Drückjagdbock 1 Leiter', 'Eisensitz', 7.241969, 51.161339, 'Unter Buche, Leiter Benni'),
  pm('Minerallecke a.d. Buche', 'Salzlecke', 7.2429, 51.16144),
);

const existing = (data: Partial<Waypoint>): Waypoint => ({ id: 'w1', revierId: 'r1', createdBy: null, name: 'X', description: '', category: 'kanzel', lat: 51, lng: 7, ...data });

describe('Revier-Import (Logik)', () => {
  it('liest die Art aus dem Jagdbegleiter-Symbol', () => {
    expect(categoryFromIcon('http://nature-software.com/images/symbols/Drueckjagdbock2.png')).toBe('kanzel_offen');
    expect(categoryFromIcon('http://nature-software.com/images/symbols/Drueckjagdbock.png')).toBe('drueckjagdbock');
    expect(categoryFromIcon('Saukanzel.png')).toBe('kanzel');
    expect(categoryFromIcon('http://x/unbekannt.png')).toBeNull();
    expect(categoryFromIcon(undefined)).toBeNull();
  });

  it('macht aus Punkten Einrichtungen und benennt namenlose', () => {
    const result = revierImportFrom(featuresFromText('e.kml', JAGDBEGLEITER));
    expect(result.boundary).toBeNull();
    expect(result.waypoints.map((w) => [w.name, w.category, w.action])).toEqual([
      ['Kirrung Drei Eichen', 'kirrung', 'new'],
      ['Wäschdiek', 'kanzel', 'new'],
      ['Drückjagdbock 10 mit Dach', 'kanzel_offen', 'new'],
      ['Stahlleiter Birgder Höhe', 'ansitzleiter', 'new'],
      ['Lorke unten im Wald', 'hochsitz', 'new'],
      ['DJB 3', 'kanzel', 'new'],
      ['Führerbunker', 'fahrbare_kanzel', 'new'],
      ['Wildkamera', 'wildkamera', 'new'],
      ['Wildkamera', 'wildkamera', 'new'],
      ['Drückjagdbock 1 Leiter', 'ansitzleiter', 'new'],
      ['Minerallecke a.d. Buche', 'salzlecke', 'new'],
    ]);
    expect(result.waypoints[7]!.generatedName).toBe(true);
    expect(result.waypoints[9]!.description).toBe('Unter Buche, Leiter Benni');
  });

  it('nimmt das Symbol vor dem Namen', () => {
    expect(importCategory('Drückjagdbock 13', 'Leitersitz.png')).toBe('ansitzleiter');
    expect(importCategory('DJB 2A', 'Kanzel.png')).toBe('kanzel');
    expect(importCategory('Neuer Bock', undefined)).toBe('drueckjagdbock');
    expect(importCategory('Suhle', 'Saukanzel.png')).toBe('kanzel');
    expect(importCategory('Minerallecke an der offenen Leiter', 'Salzlecke.png')).toBe('salzlecke');
    expect(importCategory('Mobiler Sitz Robert', 'Drueckjagdbock.png')).toBe('drueckjagdbock');
    expect(importCategory('', 'unbekannt.png')).toBe('sonstiges');
  });

  it('erkennt vorhandene Einrichtungen und gleiche Namen in der Datei', () => {
    const fc = featuresFromText(
      'e.kml',
      kml(boundary, pm('Wäschdiek', 'Saukanzel', 7.24935, 51.1643), pm('Buche', 'Kanzel', 7.2429, 51.1612), pm('', 'Kamera', 7.257483, 51.170258), pm('Buche', 'Kanzel', 7.25, 51.17)),
    );
    const result = revierImportFrom(fc, [
      existing({ id: 'a', name: 'wäschdiek', lat: 51.1643, lng: 7.24935 }),
      existing({ id: 'b', name: 'Buche', lat: 51.16, lng: 7.24 }),
      existing({ id: 'c', name: 'Kamera Lorke', category: 'wildkamera', lat: 51.17026, lng: 7.25748 }),
      existing({ id: 'd', name: 'Wildkamera', category: 'wildkamera', lat: 51.1, lng: 7.1 }),
    ]);
    expect(result.boundary?.coordinates).toHaveLength(1);
    expect(result.waypoints.map((w) => [w.name, w.action, w.existingId])).toEqual([
      ['Wäschdiek', 'update', 'a'],
      ['Buche', 'update', 'b'],
      ['Kamera Lorke', 'same', 'c'],
      ['Buche (2)', 'new', null],
    ]);
  });

  it('meldet Dateien ohne Flächen und Punkte', () => {
    expect(() => revierImportFrom(featuresFromText('l.geojson', '{"type":"LineString","coordinates":[[7,51],[7.1,51.1]]}'))).toThrow('weder Flächen noch Punkte');
  });
});

describe('Revier-Import (Oberfläche)', () => {
  it('übernimmt Grenze und Einrichtungen aus einer Datei', async () => {
    const auth = signedIn();
    const profiles = new FakeProfiles();
    profiles.seed(auth.user!.id, { displayName: 'Max', username: 'max' });
    const groups = new FakeGroups(auth, profiles);
    const groupId = groups.seedGroup('Hegering', [[auth.user!.id, 'owner']]);
    const reviere = new FakeReviere(auth, groups);
    const id = reviere.seedRevier(groupId, '15 Höfe');
    reviere.seedWaypoint(id, { name: 'Wäschdiek', category: 'kanzel', lat: 51.1643, lng: 7.24935 });
    reviere.seedWaypoint(id, { name: 'Buche', category: 'hochsitz', lat: 51.16, lng: 7.24 });
    renderApp(`/revier/${id}`, { auth, profiles, groups, reviere });

    await screen.findByRole('button', { name: 'Einrichtungen importieren' });
    const file = kml(boundary, pm('Wäschdiek', 'Saukanzel', 7.24935, 51.1643), pm('Buche', 'Kanzel', 7.2429, 51.1612), pm('', 'Kamera', 7.25, 51.17), pm('Leiter', 'Leitersitz', 7.26, 51.157));
    await userEvent.upload(screen.getByTestId('boundary-file'), new File([file], 'Einrichtungen.kml'));

    const list = await screen.findByRole('list', { name: 'Einrichtungen aus der Datei' });
    expect(within(list).getByRole('checkbox', { name: /^Wildkamera/ })).toBeInTheDocument();
    expect(within(list).getByText('gibt es schon')).toBeInTheDocument();
    expect(within(list).getByText('wird aktualisiert')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Art von Leiter'), 'hochsitz');
    await userEvent.click(within(list).getByRole('checkbox', { name: /^Wildkamera/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Grenze, 1 Einrichtung, 1 Änderung übernehmen' }));

    expect(await screen.findByText('Aus „Einrichtungen.kml“ übernommen: Reviergrenze, 1 neue Einrichtungen, 1 geänderte Einrichtungen.')).toBeInTheDocument();
    expect(reviere.boundaryList).toHaveLength(1);
    expect(reviere.waypointList.map((w) => [w.name, w.category])).toEqual([
      ['Wäschdiek', 'kanzel'],
      ['Buche', 'kanzel'],
      ['Leiter', 'hochsitz'],
    ]);
    expect(reviere.waypointList[1]!.lat).toBe(51.1612);
  });
});
