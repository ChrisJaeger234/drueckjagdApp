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
    // Einrichtungen erscheinen grau in der Karte …
    expect(await screen.findByRole('button', { name: 'Marker Langer Kanzel' })).toBeInTheDocument();
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
    expect(within(screen.getByRole('list', { name: 'Stände' })).getByText('Drückjagdbock')).toBeInTheDocument();
  });

  it('übernimmt auch per Antippen in der Karte', async () => {
    const s = setup();
    renderApp(`/jagd/${s.huntId}`, s);
    await userEvent.click(await screen.findByRole('button', { name: 'Marker Parkplatz Hof' }));
    expect(screen.getByLabelText('Art')).toHaveValue('parkplatz');
    await userEvent.click(screen.getByRole('button', { name: 'Als Stand übernehmen' }));
    await waitFor(() => expect(s.hunts.standList[0]).toMatchObject({ label: 'Parkplatz Hof', category: 'parkplatz' }));
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
