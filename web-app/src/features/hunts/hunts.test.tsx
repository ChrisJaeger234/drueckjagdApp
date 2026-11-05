import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FakeGroups, FakeHunts, FakeProfiles, FakeReviere } from '../../test/fakes';
import { renderApp, signedIn } from '../../test/renderApp';
import type { GroupRole } from '../groups/groupModel';
import { formatHuntTime, toLocalInput } from './format';
import { validateHunt } from './HuntFormPage';
import { huntPermissions, sortStands, type Participant, type Stand } from './huntModel';

const part = (role: Participant['role']): Participant => ({ id: 'p', huntId: 'h', userId: 'me', role, standId: null, zoneId: null, note: '', name: 'Max' });

describe('Jagdregeln', () => {
  it('leitet Rechte wie hunt_permissions.dart ab', () => {
    expect(huntPermissions('me', 'member', null).canManage).toBe(false);
    expect(huntPermissions('me', 'member', part('ansteller')).canManage).toBe(true);
    expect(huntPermissions('me', 'member', part('ansteller')).canAppointLeader).toBe(false);
    expect(huntPermissions('me', 'member', part('ansteller')).assignableRoles).not.toContain('jagdleiter');
    expect(huntPermissions('me', 'member', part('jagdleiter')).assignableRoles).toContain('jagdleiter');
    expect(huntPermissions('me', 'admin', null).canDelete).toBe(true);
    expect(huntPermissions('me', 'member', part('schuetze')).canDelete).toBe(false);
    expect(huntPermissions('me', null, null).canReport).toBe(false);
  });

  it('sortiert Stände natürlich', () => {
    const s = (label: string): Stand => ({ id: label, huntId: 'h', label, waypointId: null, category: null, zoneId: null, lat: 0, lng: 0, description: '', sortOrder: 0 });
    expect(sortStands([s('Stand 10'), s('Stand 2'), s('Stand 1')]).map((x) => x.label)).toEqual(['Stand 1', 'Stand 2', 'Stand 10']);
  });

  it('prüft Termin und Titel', () => {
    const base = { title: 'Drückjagd', revierId: null, description: '', startsAt: '2026-11-21T08:00', endsAt: null, meetingPoint: '', gameRelease: '', safetyNotes: '', emergencyInfo: '', selfJoin: true };
    expect(Object.values(validateHunt(base)).filter(Boolean)).toEqual([]);
    expect(validateHunt({ ...base, title: 'D' }).title).toBeTruthy();
    expect(validateHunt({ ...base, endsAt: '2026-11-21T07:00' }).endsAt).toContain('nach dem Beginn');
    expect(toLocalInput(new Date(2026, 10, 21, 8, 5).toISOString())).toBe('2026-11-21T08:05');
    expect(formatHuntTime(new Date(2026, 10, 21, 8).toISOString(), new Date(2026, 10, 21, 14).toISOString())).toMatch(/21\.11\.2026, 08:00 – 14:00 Uhr$/);
  });
});

function setup(role: GroupRole = 'owner') {
  const auth = signedIn();
  const me = auth.user!.id;
  const profiles = new FakeProfiles();
  profiles.seed(me, { displayName: 'Max', username: 'max' });
  profiles.seed('u-anna', { displayName: 'Anna', username: 'anna' });
  const groups = new FakeGroups(auth, profiles);
  const groupId = groups.seedGroup('Hegering Nord', [
    [me, role],
    ['u-anna', role === 'owner' ? 'member' : 'owner'],
  ]);
  const reviere = new FakeReviere(auth, groups);
  const hunts = new FakeHunts(auth, groups, profiles);
  return { auth, profiles, groups, reviere, hunts, groupId, me };
}

describe('Jagden', () => {
  it('plant eine Jagd, der Ersteller wird Jagdleiter', async () => {
    const s = setup();
    s.reviere.seedRevier(s.groupId, 'Fünfzehnhöfe');
    renderApp(`/gruppe/${s.groupId}`, s);
    await userEvent.click(await screen.findByRole('link', { name: 'Jagd planen' }));
    await userEvent.type(await screen.findByLabelText('Titel'), 'Drückjagd Eichenhang');
    await userEvent.selectOptions(screen.getByLabelText('Revier'), 'Fünfzehnhöfe');
    await userEvent.type(screen.getByLabelText('Freigabe'), 'Schwarzwild, Fuchs');
    await userEvent.type(screen.getByLabelText('Notfall'), 'Rettungspunkt R-123');
    await userEvent.click(screen.getByRole('button', { name: 'Jagd anlegen' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Drückjagd Eichenhang' })).toBeInTheDocument();
    expect(screen.getByText('Schwarzwild, Fuchs')).toBeInTheDocument();
    expect(screen.getByText('Rettungspunkt R-123')).toBeInTheDocument();
    expect(await screen.findByText('Du bist dabei als')).toBeInTheDocument();
    expect(screen.getAllByText('Jagdleiter').length).toBeGreaterThan(0);
  });

  it('Mitglied trägt sich als Schütze ein, ohne Leitungsrechte', async () => {
    const s = setup('member');
    const huntId = s.hunts.seedHunt(s.groupId, { title: 'Drückjagd' });
    s.hunts.seedParticipant(huntId, 'u-anna', 'jagdleiter');
    s.hunts.seedStand(huntId, 'Stand 4');
    renderApp(`/jagd/${huntId}`, s);
    await userEvent.click(await screen.findByRole('button', { name: 'Eintragen' }));
    expect(await screen.findByText('Noch kein Stand zugeteilt.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stand setzen' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Schütze für Stand 4')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Stände' })).toHaveTextContent('frei');
  });

  it('Jagdleitung setzt Stände, teilt zu und zeichnet ein Treiben', async () => {
    const s = setup();
    const huntId = s.hunts.seedHunt(s.groupId);
    s.hunts.seedParticipant(huntId, s.me, 'jagdleiter');
    s.hunts.seedParticipant(huntId, 'u-anna', 'schuetze');
    renderApp(`/jagd/${huntId}`, s);
    await userEvent.click(await screen.findByRole('button', { name: 'Stand setzen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Karte antippen' }));
    expect(screen.getByLabelText('Bezeichnung')).toHaveValue('Stand 1');
    await userEvent.click(screen.getByRole('button', { name: 'Stand speichern' }));
    expect(await screen.findByText('Stand 1 gesetzt.')).toBeInTheDocument();
    await userEvent.selectOptions(await screen.findByLabelText('Schütze für Stand 1'), 'Anna (Schütze)');
    expect(await screen.findByRole('button', { name: 'Marker Stand 1 · Anna' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Zone zeichnen' }));
    const tap = screen.getByRole('button', { name: 'Karte antippen' });
    for (let i = 0; i < 3; i++) await userEvent.click(tap);
    await userEvent.type(screen.getByLabelText('Name der Zone'), 'Treiben 1');
    await userEvent.click(screen.getByRole('button', { name: 'Zone speichern' }));
    expect(await screen.findByText('Treiben „Treiben 1“ gespeichert.')).toBeInTheDocument();
    expect(screen.getByTestId('map')).toHaveAttribute('data-areas', '1');
  });

  it('meldet „angeschossen“ als offene Nachsuche und erledigt sie', async () => {
    const s = setup('member');
    const huntId = s.hunts.seedHunt(s.groupId, { status: 'laufend' });
    const standId = s.hunts.seedStand(huntId, 'Stand 3');
    s.hunts.seedParticipant(huntId, s.me, 'schuetze', standId);
    renderApp(`/jagd/${huntId}`, s);
    expect(await screen.findByText('Dein Stand: Stand 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Angeschossen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Schwarzwild' }));
    expect(screen.getByLabelText('Stand')).toHaveValue(standId);
    await userEvent.click(screen.getByRole('button', { name: 'Angeschossen melden' }));
    expect(await screen.findByText('1 offene Nachsuche')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Meldungen' });
    expect(list).toHaveTextContent('Angeschossen: Schwarzwild');
    expect(list).toHaveTextContent('Stand 3');
    await userEvent.click(within(list).getByRole('button', { name: 'Erledigt' }));
    expect(await within(list).findByText('Nachsuche erledigt')).toBeInTheDocument();
    expect(screen.queryByText('1 offene Nachsuche')).not.toBeInTheDocument();
  });

  it('startet und beendet die Jagd und zeigt sie in der Übersicht', async () => {
    const s = setup();
    const huntId = s.hunts.seedHunt(s.groupId, { title: 'Drückjagd Nord' });
    renderApp('/', s);
    await userEvent.click(await screen.findByRole('link', { name: /Drückjagd Nord/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Jagd starten' }));
    expect(await screen.findByRole('button', { name: 'Jagd beenden' })).toBeInTheDocument();
    expect(s.hunts.hunts.find((h) => h.id === huntId)?.status).toBe('laufend');
  });

  it('zeigt Mitgliedern ohne Leitung keine Verwaltung', async () => {
    const s = setup('member');
    const huntId = s.hunts.seedHunt(s.groupId, { selfJoin: false });
    renderApp(`/jagd/${huntId}`, s);
    expect(await screen.findByText('Die Jagdleitung trägt die Teilnehmer ein.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Jagdleitung' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Jagd planen' })).not.toBeInTheDocument();
  });
});
