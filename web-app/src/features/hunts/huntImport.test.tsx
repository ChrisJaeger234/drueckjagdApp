import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { featuresFromFile, featuresFromText, kmlFromKmz } from '../../modules/map/geo';
import { FakeGroups, FakeHunts, FakeProfiles } from '../../test/fakes';
import { renderApp, signedIn } from '../../test/renderApp';
import { guessZoneKind, huntImportFrom } from './huntImport';

// Aufgebaut wie ein Export aus Google My Maps: Gesamtfläche, zwei Treiben, Punkte.
const ring = (pts: [number, number][]) => pts.map(([x, y]) => `${x},${y},0`).join('\n');
const poly = (name: string, style: string, pts: [number, number][]) =>
  `<Placemark><name>${name}</name><styleUrl>#${style}</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>${ring(pts)}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;
const point = (name: string, x: number, y: number) => `<Placemark><name>${name}</name><Point><coordinates>${x},${y},0</coordinates></Point></Placemark>`;
const style = (id: string, abgr: string) =>
  `<Style id="${id}-normal"><PolyStyle><color>${abgr}</color></PolyStyle></Style><StyleMap id="${id}"><Pair><key>normal</key><styleUrl>#${id}-normal</styleUrl></Pair></StyleMap>`;

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Reviergrenzen</name>
${style('gelb', '4d00d6ff')}${style('blau', '4d7e231a')}
${poly('Karte', 'gelb', [[7.23, 51.15], [7.27, 51.15], [7.27, 51.19], [7.23, 51.19], [7.23, 51.15]])}
${point('Treffpunkt Start', 7.2571615, 51.1670421)}
${point('DJB #10', 7.2446752, 51.1597495)}
${point('Langer Kanzel', 7.2440725, 51.1656874)}
${poly('TW1 - Runde 1', 'blau', [[7.2468, 51.1755], [7.2438, 51.1705], [7.245, 51.1702], [7.2485, 51.175]])}
${poly('TW2 - Runde 1', 'blau', [[7.2485, 51.175], [7.2452, 51.1703], [7.2466, 51.1699], [7.2503, 51.1747], [7.2485, 51.175]])}
<Placemark><name>Weg</name><LineString><coordinates>7.24,51.16,0 7.25,51.17,0</coordinates></LineString></Placemark>
</Document></kml>`;

/** Minimales ZIP mit einer Datei (Deflate), wie ein KMZ. */
async function kmz(name: string, text: string): Promise<Uint8Array> {
  const raw = new TextEncoder().encode(text);
  const data = new Uint8Array(await new Response(new ReadableStream<BufferSource>({ start: (c) => (c.enqueue(raw), c.close()) }).pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  const fileName = new TextEncoder().encode(name);
  const local = new Uint8Array(30 + fileName.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint16(8, 8, true);
  lv.setUint32(18, data.length, true);
  lv.setUint32(22, raw.length, true);
  lv.setUint16(26, fileName.length, true);
  local.set(fileName, 30);
  const central = new Uint8Array(46 + fileName.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint16(10, 8, true);
  cv.setUint32(20, data.length, true);
  cv.setUint32(24, raw.length, true);
  cv.setUint16(28, fileName.length, true);
  cv.setUint32(42, 0, true);
  central.set(fileName, 46);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, 1, true);
  ev.setUint16(10, 1, true);
  ev.setUint32(12, central.length, true);
  ev.setUint32(16, local.length + data.length, true);
  const out = new Uint8Array(local.length + data.length + central.length + end.length);
  out.set(local, 0);
  out.set(data, local.length);
  out.set(central, local.length + data.length);
  out.set(end, local.length + data.length + central.length);
  return out;
}

describe('Karten-Import (Logik)', () => {
  it('macht aus Flächen Zonen und aus Punkten Stände', () => {
    const result = huntImportFrom(featuresFromText('karte.kml', KML), ['dJB #10']);
    expect(result.zones.map((z) => [z.name, z.kind, z.color])).toEqual([
      ['Karte', 'sonstiges', '#ffd600'],
      ['TW1 - Runde 1', 'treiben', '#1a237e'],
      ['TW2 - Runde 1', 'treiben', '#1a237e'],
    ]);
    // Offener Ring wird geschlossen.
    const tw1 = result.zones[1]!.geometry;
    expect(tw1.type === 'Polygon' && tw1.coordinates[0]!.at(-1)).toEqual([7.2468, 51.1755]);
    expect(result.stands.map((s) => [s.label, s.duplicate])).toEqual([
      ['Treffpunkt Start', false],
      ['DJB #10', true],
      ['Langer Kanzel', false],
    ]);
    expect(result.stands[2]).toMatchObject({ lat: 51.1656874, lng: 7.2440725 });
  });

  it('rät die Zonenart aus dem Namen', () => {
    expect(guessZoneKind('Sicherheitsbereich B-Straße')).toBe('sicherheitszone');
    expect(guessZoneKind('Sperrfläche Wohngebiet')).toBe('sperrzone');
    expect(guessZoneKind('Sammelplatz Hütte')).toBe('sammelplatz');
    expect(guessZoneKind('Treiben 3 Eichenhang')).toBe('treiben');
  });

  it('meldet Dateien ohne Flächen und Punkte', () => {
    expect(() => huntImportFrom(featuresFromText('weg.geojson', '{"type":"LineString","coordinates":[[7,51],[7.1,51.1]]}'))).toThrow('weder Flächen noch Punkte');
    expect(() => featuresFromText('kaputt.kml', '<kml><nicht')).toThrow('keine gültige KML');
  });

  it('liest KMZ wie aus Google My Maps', async () => {
    const bytes = await kmz('doc.kml', KML);
    expect(await kmlFromKmz(bytes)).toContain('TW1 - Runde 1');
    const file = new File([bytes as BlobPart], 'Revier.kmz');
    expect(huntImportFrom(await featuresFromFile(file)).zones).toHaveLength(3);
    await expect(kmlFromKmz(new Uint8Array([1, 2, 3]))).rejects.toThrow('als KML');
  });
});

function setup() {
  const auth = signedIn();
  const me = auth.user!.id;
  const profiles = new FakeProfiles();
  profiles.seed(me, { displayName: 'Max', username: 'max' });
  const groups = new FakeGroups(auth, profiles);
  const groupId = groups.seedGroup('Hegering', [[me, 'owner']]);
  const hunts = new FakeHunts(auth, groups, profiles);
  const huntId = hunts.seedHunt(groupId, { status: 'geplant' });
  hunts.seedParticipant(huntId, me, 'jagdleiter', null);
  hunts.seedStand(huntId, 'Langer Kanzel');
  return { auth, profiles, groups, hunts, huntId };
}

describe('Karten-Import (Jagd)', () => {
  it('zeigt eine Vorschau und übernimmt die Auswahl', async () => {
    const s = setup();
    renderApp(`/jagd/${s.huntId}`, s);
    await screen.findByRole('button', { name: 'Karte importieren' });
    await userEvent.upload(screen.getByTestId('hunt-import-file'), new File([KML], 'Reviergrenzen.kml'));

    const zones = await screen.findByRole('list', { name: 'Zonen aus der Datei' });
    expect(within(zones).getByLabelText('Art von Karte')).toHaveValue('sonstiges');
    await userEvent.selectOptions(within(zones).getByLabelText('Art von TW2 - Runde 1'), 'sicherheitszone');
    await userEvent.click(within(zones).getByRole('checkbox', { name: /Karte/ }));

    const stands = screen.getByRole('list', { name: 'Stände aus der Datei' });
    expect(within(stands).getByRole('checkbox', { name: /Langer Kanzel/ })).toBeDisabled();
    expect(within(stands).getByText('gibt es schon')).toBeInTheDocument();
    await userEvent.click(within(stands).getByRole('checkbox', { name: /Treffpunkt Start/ }));

    await userEvent.click(screen.getByRole('button', { name: '2 Zonen und 1 Stand übernehmen' }));
    expect(await screen.findByText('2 Zonen und 1 Stand übernommen.')).toBeInTheDocument();
    await waitFor(() => expect(s.hunts.zoneList.map((z) => [z.name, z.kind, z.color])).toEqual([
      ['TW1 - Runde 1', 'treiben', '#1a237e'],
      ['TW2 - Runde 1', 'sicherheitszone', '#1a237e'],
    ]));
    expect(s.hunts.standList.map((x) => x.label).sort()).toEqual(['DJB #10', 'Langer Kanzel']);
  });

  it('erklärt, wenn die Datei nicht passt', async () => {
    const s = setup();
    renderApp(`/jagd/${s.huntId}`, s);
    await screen.findByRole('button', { name: 'Karte importieren' });
    await userEvent.upload(screen.getByTestId('hunt-import-file'), new File(['<kml><kaputt'], 'kaputt.kml'));
    expect(await screen.findByRole('alert')).toHaveTextContent('keine gültige KML');
  });
});

describe('Reiter „Karte“', () => {
  it('zeigt Zonen und Stände geplanter und laufender Jagden', async () => {
    const s = setup();
    const groupId = s.hunts.hunts.find((h) => h.id === s.huntId)!.groupId;
    s.hunts.seedHunt(groupId, { title: 'Vorbei', status: 'beendet' });
    Object.assign(s.hunts.hunts.find((h) => h.id === s.huntId)!, { title: 'Drückjagd Nord' });
    renderApp('/karte', s);
    const list = await screen.findByRole('list', { name: 'Offene Jagden' });
    expect(within(list).getByText('Drückjagd Nord')).toBeInTheDocument();
    expect(within(list).queryByText('Vorbei')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Marker Langer Kanzel' })).toBeInTheDocument();
  });
});
