import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FakeGroups, FakeProfiles, FakeReviere } from '../../test/fakes';
import { renderApp, signedIn } from '../../test/renderApp';
import type { GroupRole } from '../groups/groupModel';
import { parseCategory } from './revierModel';

function setup(role: GroupRole = 'owner') {
  const auth = signedIn();
  const profiles = new FakeProfiles();
  profiles.seed(auth.user!.id, { displayName: 'Max', username: 'max' });
  const groups = new FakeGroups(auth, profiles);
  const groupId = groups.seedGroup('Hegering Nord', [[auth.user!.id, role]]);
  const reviere = new FakeReviere(auth, groups);
  return { auth, profiles, groups, reviere, groupId };
}

describe('Revierregeln', () => {
  it('zeigt unbekannte Kategorien als Sonstiges', () => {
    expect(parseCategory('kanzel')).toBe('kanzel');
    expect(parseCategory('neu_in_db')).toBe('sonstiges');
  });
});

describe('Reviere', () => {
  it('legt aus der Gruppe ein Revier an', async () => {
    const s = setup();
    renderApp(`/gruppe/${s.groupId}`, s);
    await userEvent.click(await screen.findByRole('link', { name: 'Revier anlegen' }));
    await userEvent.type(await screen.findByLabelText('Name des Reviers'), 'Fünfzehnhöfe');
    await userEvent.click(screen.getByRole('button', { name: 'Revier anlegen' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Fünfzehnhöfe' })).toBeInTheDocument();
    expect(s.reviere.reviere).toHaveLength(1);
    expect(await screen.findByTestId('map')).toBeInTheDocument();
  });

  it('zeichnet eine Reviergrenze mit Rückgängig', async () => {
    const s = setup();
    const id = s.reviere.seedRevier(s.groupId, 'Süd');
    renderApp(`/revier/${id}`, s);
    await userEvent.click(await screen.findByRole('button', { name: 'Grenze zeichnen' }));
    const tap = screen.getByRole('button', { name: 'Karte antippen' });
    for (let i = 0; i < 4; i++) await userEvent.click(tap);
    expect(screen.getByTestId('map')).toHaveAttribute('data-draft', '4');
    await userEvent.click(screen.getByRole('button', { name: 'Letzten Punkt entfernen' }));
    expect(screen.getByText('3', { selector: 'strong' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Grenze speichern' }));
    expect(await screen.findByText('Reviergrenze gespeichert.')).toBeInTheDocument();
    expect(s.reviere.boundaryList[0]?.geometry.type).toBe('Polygon');
    expect(await screen.findByText(/ca\. .* ha/)).toBeInTheDocument();
    expect(screen.getByTestId('map')).toHaveAttribute('data-boundaries', '1');
  });

  it('importiert eine Grenze aus einer GeoJSON-Datei und meldet Fehler', async () => {
    const s = setup();
    const id = s.reviere.seedRevier(s.groupId, 'Süd');
    renderApp(`/revier/${id}`, s);
    await screen.findByRole('button', { name: 'Datei importieren' });
    const input = screen.getByTestId('boundary-file');
    await userEvent.upload(input, new File(['{"type":"Point","coordinates":[7,51]}'], 'punkt.geojson'));
    expect(await screen.findByRole('alert')).toHaveTextContent('keine Fläche');
    const polygon = { type: 'Polygon', coordinates: [[[7.24, 51.16], [7.26, 51.16], [7.25, 51.18], [7.24, 51.16]]] };
    await userEvent.upload(input, new File([JSON.stringify(polygon)], 'revier.geojson'));
    expect(await screen.findByText('Reviergrenze aus „revier.geojson“ übernommen.')).toBeInTheDocument();
    expect(s.reviere.boundaryList[0]?.geometry.type).toBe('MultiPolygon');
  });

  it('setzt, bearbeitet und löscht eine Einrichtung', async () => {
    const s = setup('admin');
    const id = s.reviere.seedRevier(s.groupId, 'Süd');
    renderApp(`/revier/${id}`, s);
    await userEvent.click(await screen.findByRole('button', { name: 'Einrichtung setzen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Karte antippen' }));
    await userEvent.selectOptions(screen.getByLabelText('Art der Einrichtung'), 'drueckjagdbock');
    await userEvent.type(screen.getByLabelText('Name'), 'Bock 7');
    await userEvent.click(screen.getByRole('button', { name: 'Einrichtung speichern' }));
    expect(await screen.findByText('„Bock 7“ gespeichert.')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Einrichtungen' });
    expect(list).toHaveTextContent('Drückjagdbock');

    await userEvent.click(screen.getByRole('button', { name: 'Marker Bock 7' }));
    await userEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Bock 8');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await within(list).findByText('Bock 8')).toBeInTheDocument();

    await userEvent.click(within(list).getByRole('button', { name: /Bock 8/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ja, löschen' }));
    expect(await screen.findByText('Einrichtungen (0)')).toBeInTheDocument();
    // Admins dürfen Reviere bearbeiten, aber nicht löschen.
    expect(screen.queryByRole('button', { name: 'Revier löschen' })).not.toBeInTheDocument();
  });

  it('zeigt Mitgliedern das Revier nur zum Ansehen', async () => {
    const s = setup('member');
    const id = s.reviere.seedRevier(s.groupId, 'Süd');
    s.reviere.seedWaypoint(id, { name: 'Kanzel Eiche', category: 'kanzel' });
    renderApp(`/revier/${id}`, s);
    await userEvent.click(await screen.findByRole('button', { name: 'Marker Kanzel Eiche' }));
    expect(screen.getAllByText('Kanzel').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Einrichtung setzen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Grenze zeichnen' })).not.toBeInTheDocument();
  });

  it('zeigt auf der Karte alle Reviere und Einrichtungen', async () => {
    const s = setup('member');
    const id = s.reviere.seedRevier(s.groupId, 'Süd');
    s.reviere.seedWaypoint(id, { name: 'Sammelplatz Hof', category: 'sammelplatz' });
    renderApp('/karte', s);
    await userEvent.click(await screen.findByRole('button', { name: 'Marker Sammelplatz Hof' }));
    expect(screen.getByRole('link', { name: 'Revier Süd öffnen' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Luftbild' }));
    expect(screen.getByTestId('map')).toHaveAttribute('data-layer', 'luftbild');
  });

  it('löscht als Owner ein Revier', async () => {
    const s = setup();
    const id = s.reviere.seedRevier(s.groupId, 'Süd');
    renderApp(`/revier/${id}`, s);
    await userEvent.click(await screen.findByRole('button', { name: 'Revier löschen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Endgültig löschen' }));
    expect(await screen.findByText('Noch keine Reviere in dieser Gruppe.')).toBeInTheDocument();
  });
});
