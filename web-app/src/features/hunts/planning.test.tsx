import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FakeGroups, FakeHunts, FakeProfiles, FakeReviere } from '../../test/fakes';
import { renderApp, signedIn } from '../../test/renderApp';
import { guessPointCategory } from './huntImport';
import { summarize, summaryText } from './HuntSummary';
import type { Hunt, Participant, Report } from './huntModel';

function setup() {
  const auth = signedIn();
  const me = auth.user!.id;
  const profiles = new FakeProfiles();
  profiles.seed(me, { displayName: 'Max', username: 'max' });
  const groups = new FakeGroups(auth, profiles);
  const groupId = groups.seedGroup('Hegering', [[me, 'owner']]);
  const reviere = new FakeReviere(auth, groups);
  const revierId = reviere.seedRevier(groupId, 'Fünfzehnhöfe');
  reviere.seedWaypoint(revierId, { name: 'Langer Kanzel', category: 'kanzel', lat: 51.1656874, lng: 7.2440725 });
  reviere.seedWaypoint(revierId, { name: 'Parkplatz Hof', category: 'parkplatz' });
  const hunts = new FakeHunts(auth, groups, profiles);
  const huntId = hunts.seedHunt(groupId, { revierId, revierName: 'Fünfzehnhöfe' });
  hunts.seedParticipant(huntId, me, 'jagdleiter', null);
  return { auth, profiles, groups, reviere, hunts, huntId };
}

describe('Jagd planen mit Einrichtungen des Reviers', () => {
  it('übernimmt eine Einrichtung mit eigenem Namen und Art als Stand', async () => {
    const s = setup();
    renderApp(`/jagd/${s.huntId}`, s);
    // Einrichtungen erscheinen erst auf Wunsch grau in der Karte …
    const toggle = await screen.findByRole('checkbox', { name: 'Einrichtungen des Reviers grau in der Karte zeigen' });
    expect(screen.queryByRole('button', { name: 'Marker Langer Kanzel' })).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Marker Langer Kanzel' })).toBeInTheDocument();
    // … und als Liste.
    const list = screen.getByRole('list', { name: 'Einrichtungen aus dem Revier' });
    await userEvent.click(within(list).getByRole('button', { name: 'Langer Kanzel übernehmen' }));

    const name = screen.getByLabelText('Name in der Jagd');
    expect(name).toHaveValue('Langer Kanzel');
    expect(screen.getByLabelText('Art')).toHaveValue('kanzel');
    await userEvent.clear(name);
    await userEvent.type(name, 'Stand 1 Kanzel');
    await userEvent.selectOptions(screen.getByLabelText('Art'), 'drueckjagdbock');
    await userEvent.click(screen.getByRole('button', { name: 'Als Stand übernehmen' }));

    expect(await screen.findByText('Stand 1 Kanzel als Stand übernommen.')).toBeInTheDocument();
    await waitFor(() => expect(s.hunts.standList).toHaveLength(1));
    expect(s.hunts.standList[0]).toMatchObject({ label: 'Stand 1 Kanzel', category: 'drueckjagdbock', lat: 51.1656874, lng: 7.2440725 });
    expect(s.hunts.standList[0]!.waypointId).toBe(s.reviere.waypointList[0]!.id);
    // Übernommene Einrichtung verschwindet aus der Liste, der Stand zeigt die Art.
    expect(within(screen.getByRole('list', { name: 'Einrichtungen aus dem Revier' })).queryByText('Langer Kanzel')).not.toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Stände' })).getByText('Drückjagdbock ohne Dach')).toBeInTheDocument();
  });

  it('übernimmt auch per Antippen in der Karte', async () => {
    const s = setup();
    renderApp(`/jagd/${s.huntId}`, s);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Einrichtungen des Reviers grau in der Karte zeigen' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Marker Parkplatz Hof' }));
    expect(screen.getByLabelText('Art')).toHaveValue('parkplatz');
    await userEvent.click(screen.getByRole('button', { name: 'Als Stand übernehmen' }));
    await waitFor(() => expect(s.hunts.standList[0]).toMatchObject({ label: 'Parkplatz Hof', category: 'parkplatz' }));
  });

  it('übernimmt angehakte Einrichtungen auf einmal', async () => {
    const s = setup();
    renderApp(`/jagd/${s.huntId}`, s);
    const list = await screen.findByRole('list', { name: 'Einrichtungen aus dem Revier' });
    await userEvent.click(within(list).getByRole('checkbox', { name: 'Langer Kanzel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Alle Parkplatz' }));
    await userEvent.click(screen.getByRole('button', { name: '2 Einrichtungen übernehmen' }));
    expect(await screen.findByText('2 Einrichtungen als Stände übernommen.')).toBeInTheDocument();
    expect(s.hunts.standList.map((x) => [x.label, x.category])).toEqual([
      ['Langer Kanzel', 'kanzel'],
      ['Parkplatz Hof', 'parkplatz'],
    ]);
  });

  it('zeigt nicht übernommene Einrichtungen nur der Planung', async () => {
    const s = setup();
    const other = 'u-schuetze';
    s.profiles.seed(other, { displayName: 'Eva', username: 'eva' });
    s.groups.memberList.push({ ...s.groups.memberList[0]!, userId: other, role: 'member' });
    s.hunts.seedParticipant(s.huntId, other, 'schuetze', null);
    s.auth.user = { ...s.auth.user!, id: other };
    renderApp(`/jagd/${s.huntId}`, s);
    expect(await screen.findByTestId('map')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marker Langer Kanzel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Einrichtungen aus dem Revier' })).not.toBeInTheDocument();
  });

  it('zeigt der Planung eine Vorschau der laufenden Jagd, ohne etwas zu speichern', async () => {
    const s = setup();
    const kanzel = s.hunts.seedStand(s.huntId, 'Langer Kanzel');
    const eva = 'u-eva';
    s.profiles.seed(eva, { displayName: 'Eva', username: 'eva' });
    s.hunts.seedParticipant(s.huntId, eva, 'schuetze', kanzel);
    renderApp(`/jagd/${s.huntId}`, s);
    await userEvent.click(await screen.findByRole('button', { name: 'Vorschau' }));

    const banner = screen.getByRole('region', { name: 'Vorschau' });
    expect(within(banner).getByLabelText('Ansicht als')).toHaveDisplayValue('Eva (Schütze)');
    expect(screen.getByText('Dein Stand: Langer Kanzel')).toBeInTheDocument();
    // Keine Planungswerkzeuge und keine grauen Einrichtungen.
    expect(screen.queryByRole('list', { name: 'Einrichtungen aus dem Revier' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marker Parkplatz Hof' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Jagd starten' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Anblick' }));
    const submit = screen.getAllByRole('button').find((b) => /melden|senden/i.test(b.textContent ?? ''));
    await userEvent.click(submit!);
    expect(await screen.findByText(/Vorschau: Die Meldung „Anblick“ würde jetzt an alle Teilnehmer gehen/)).toBeInTheDocument();
    expect(s.hunts.reportList).toHaveLength(0);

    await userEvent.selectOptions(within(banner).getByLabelText('Ansicht als'), 'beispiel:treiber');
    expect(screen.queryByText(/Dein Stand/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Vorschau beenden' }));
    expect(screen.getByRole('button', { name: 'Jagd starten' })).toBeInTheDocument();
    expect(s.hunts.hunts[0]!.status).toBe('geplant');
  });

  it('setzt einen neuen Stand mit Art', async () => {
    const s = setup();
    renderApp(`/jagd/${s.huntId}`, s);
    await userEvent.click(await screen.findByRole('button', { name: 'Stand setzen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Karte antippen' }));
    await userEvent.selectOptions(await screen.findByLabelText('Art'), 'sammelplatz');
    await userEvent.click(screen.getByRole('button', { name: 'Stand speichern' }));
    await waitFor(() => expect(s.hunts.standList[0]).toMatchObject({ label: 'Stand 1', category: 'sammelplatz' }));
  });

  it('rät die Art importierter Punkte', () => {
    expect(guessPointCategory('Treffpunkt Halbzeit')).toBe('sammelplatz');
    expect(guessPointCategory('DJB #10')).toBe('drueckjagdbock');
    expect(guessPointCategory('Langer Kanzel')).toBe('kanzel');
    expect(guessPointCategory('Parkplatz Waldweg')).toBe('parkplatz');
    expect(guessPointCategory('1. Start TW1')).toBeNull();
  });
});

describe('Jagdzusammenfassung', () => {
  const report = (kind: Report['kind'], species: string, count = 1, extra: Partial<Report> = {}): Report => ({
    id: `${kind}${species}${count}`, huntId: 'h', reporterId: null, reporterName: 'Max', kind, species, count, standId: null, lat: null, lng: null, note: '',
    occurredAt: '2026-11-21T09:00:00Z', resolvedAt: null, ...extra,
  });
  const reports = [
    report('erlegt', 'Rehwild', 2),
    report('erlegt', 'Schwarzwild', 3),
    report('erlegt', 'Rehwild', 2, { id: 'r2' }),
    report('angeschossen', 'Schwarzwild', 1),
    report('angeschossen', 'Rehwild', 1, { resolvedAt: '2026-11-21T10:00:00Z' }),
    report('ueberschossen', 'Fuchs'),
    report('anblick', 'Rotwild', 4),
  ];

  it('zählt Strecke, Nachsuchen und Rollen', () => {
    const people = [{ role: 'jagdleiter' }, { role: 'schuetze' }, { role: 'schuetze' }, { role: 'treiber' }] as Participant[];
    const data = summarize(reports, people);
    expect(data.bag).toEqual([
      { species: 'Rehwild', count: 4 },
      { species: 'Schwarzwild', count: 3 },
    ]);
    expect(data.bagTotal).toBe(7);
    expect(data.wounded).toEqual({ total: 2, open: 1, done: 1 });
    expect([data.missed, data.sightings, data.participants]).toEqual([1, 4, 4]);
    expect(data.roles).toEqual([
      { role: 'jagdleiter', count: 1 },
      { role: 'schuetze', count: 2 },
      { role: 'treiber', count: 1 },
    ]);
    const hunt = { title: 'Drückjagd Nord', startsAt: '2026-11-21T07:00:00Z', endsAt: null } as Hunt;
    const text = summaryText(hunt, data, reports, []);
    expect(text).toContain('Strecke: 4× Rehwild, 3× Schwarzwild');
    expect(text).toContain('Nachsuchen offen: 1, erledigt: 1');
    expect(text).toContain('Angeschossen: 1× Schwarzwild (Max)');
  });

  it('zeigt die Zusammenfassung der Jagdleitung, sobald die Jagd läuft', async () => {
    const s = setup();
    Object.assign(s.hunts.hunts.find((h) => h.id === s.huntId)!, { status: 'laufend' });
    s.hunts.reportList.push(report('erlegt', 'Rehwild', 2, { huntId: s.huntId }));
    renderApp(`/jagd/${s.huntId}`, s);
    expect(await screen.findByRole('heading', { name: 'Jagdzusammenfassung' })).toBeInTheDocument();
    expect(screen.getByText('2× Rehwild')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zusammenfassung teilen' })).toBeInTheDocument();
  });
});
