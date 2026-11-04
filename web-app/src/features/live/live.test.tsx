import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeGroups, FakeHunts, FakeProfiles, FakeReviere } from '../../test/fakes';
import { renderApp, signedIn } from '../../test/renderApp';
import type { GroupRole } from '../groups/groupModel';
import { livePermissions, positionAge, type Hunt, type HuntRole, type Participant } from '../hunts/huntModel';
import { distanceMeters, shouldSend } from './liveLogic';
import { liveStore } from './liveStore';

describe('Regeln für Live-Standorte', () => {
  const hunt = (status: Hunt['status']) => ({ status }) as Hunt;
  const me = (role: HuntRole) => ({ role }) as Participant;

  it('teilen nur Treiber, Hundeführer, Bergung und Jagdleitung während der Jagd', () => {
    for (const r of ['treiber', 'hundefuehrer', 'bergung', 'jagdleiter', 'ansteller'] as HuntRole[]) {
      expect(livePermissions(hunt('laufend'), 'member', me(r))).toEqual({ canShare: true, canView: true });
    }
    expect(livePermissions(hunt('laufend'), 'member', me('schuetze'))).toEqual({ canShare: false, canView: false });
    expect(livePermissions(hunt('laufend'), 'member', me('sonstige'))).toEqual({ canShare: false, canView: false });
    expect(livePermissions(hunt('laufend'), 'admin', null)).toEqual({ canShare: false, canView: true });
    expect(livePermissions(hunt('laufend'), 'owner', me('schuetze'))).toEqual({ canShare: false, canView: true });
    expect(livePermissions(hunt('geplant'), 'owner', me('treiber'))).toEqual({ canShare: false, canView: false });
  });

  it('sendet sparsam: Bewegung ab 20 m alle 10 s, sonst alle 30 s', () => {
    const a = { lat: 51.17, lng: 7.25 };
    expect(Math.round(distanceMeters(a, { lat: 51.171, lng: 7.25 }))).toBe(111);
    expect(shouldSend(null, a, 0)).toBe(true);
    const last = { at: 0, ...a };
    expect(shouldSend(last, { lat: 51.1701, lng: 7.25 }, 15_000)).toBe(false);
    expect(shouldSend(last, { lat: 51.171, lng: 7.25 }, 5_000)).toBe(false);
    expect(shouldSend(last, { lat: 51.171, lng: 7.25 }, 10_000)).toBe(true);
    expect(shouldSend(last, a, 30_000)).toBe(true);
  });

  it('beschreibt das Alter einer Position', () => {
    const now = Date.parse('2026-11-21T10:00:00Z');
    expect(positionAge('2026-11-21T09:59:30Z', now)).toEqual({ text: 'gerade eben', stale: false });
    expect(positionAge('2026-11-21T09:58:00Z', now)).toEqual({ text: 'vor 2 Min.', stale: false });
    expect(positionAge('2026-11-21T09:50:00Z', now)).toEqual({ text: 'vor 10 Min.', stale: true });
  });
});

type Watch = (p: GeolocationPosition) => void;
let watchers: Watch[] = [];

function fix(lat: number, lng: number) {
  act(() => watchers.forEach((w) => w({ coords: { latitude: lat, longitude: lng, accuracy: 8 } } as GeolocationPosition)));
}

function setup(myRole: HuntRole | null, groupRole: GroupRole = 'member', status: Hunt['status'] = 'laufend') {
  const auth = signedIn();
  const me = auth.user!.id;
  const profiles = new FakeProfiles();
  profiles.seed(me, { displayName: 'Max', username: 'max' });
  profiles.seed('u-anna', { displayName: 'Anna', username: 'anna' });
  profiles.seed('u-ben', { displayName: 'Ben', username: 'ben' });
  const groups = new FakeGroups(auth, profiles);
  const groupId = groups.seedGroup('Hegering Nord', [
    ['u-anna', 'owner'],
    [me, groupRole],
    ['u-ben', 'member'],
  ]);
  const reviere = new FakeReviere(auth, groups);
  const hunts = new FakeHunts(auth, groups, profiles);
  const huntId = hunts.seedHunt(groupId, { title: 'Drückjagd Hohe Buche', status });
  if (myRole) hunts.seedParticipant(huntId, me, myRole);
  hunts.seedParticipant(huntId, 'u-anna', 'jagdleiter');
  hunts.seedParticipant(huntId, 'u-ben', 'hundefuehrer');
  hunts.seedPosition(huntId, 'u-ben', 51.18, 7.26);
  return { auth, profiles, groups, reviere, hunts, huntId, me };
}

describe('Standort teilen', () => {
  beforeEach(() => {
    watchers = [];
    localStorage.clear();
    liveStore.stop();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: (ok: Watch) => watchers.push(ok) - 1,
        clearWatch: (id: number) => {
          watchers[id] = () => {};
        },
      },
    });
  });
  afterEach(() => {
    liveStore.stop();
    vi.restoreAllMocks();
  });

  it('Treiber teilt seinen Standort, sieht die anderen und beendet das Teilen', async () => {
    const s = setup('treiber');
    renderApp(`/jagd/${s.huntId}`, s);
    const list = await screen.findByRole('list', { name: 'Live-Standorte' });
    expect(within(list).getByText('Ben')).toBeInTheDocument();
    expect(within(list).getByText('Hundeführer')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Marker Ben/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Meinen Standort teilen' }));
    fix(51.17, 7.25);
    await vi.waitFor(() => expect(s.hunts.positionMap.get(`${s.huntId}:${s.me}`)).toMatchObject({ lat: 51.17, lng: 7.25, accuracy: 8 }));
    expect(await screen.findByText(/Dein Standort wird geteilt: Drückjagd Hohe Buche/)).toBeInTheDocument();
    expect(screen.getByTestId('live-status')).toHaveTextContent(/Du teilst deinen Standort \(Genauigkeit etwa 8 m\)/);
    expect(screen.getByRole('switch', { name: /Bildschirm anlassen/ })).toBeChecked();

    // Kleine Bewegung kurz danach: nicht erneut senden.
    fix(51.1701, 7.25);
    expect(s.hunts.positionMap.get(`${s.huntId}:${s.me}`)?.lat).toBe(51.17);

    await userEvent.click(screen.getByRole('button', { name: 'Teilen beenden' }));
    await vi.waitFor(() => expect(s.hunts.positionMap.has(`${s.huntId}:${s.me}`)).toBe(false));
    expect(screen.queryByText(/Dein Standort wird geteilt/)).not.toBeInTheDocument();
    expect(localStorage.getItem('drueckjagd-live-sharing')).toBeNull();
  });

  it('Schützen teilen nicht und sehen keine fremden Positionen', async () => {
    const s = setup('schuetze');
    renderApp(`/jagd/${s.huntId}`, s);
    expect(await screen.findByText(/Als Schütze teilst du keinen Standort/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Meinen Standort teilen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Live-Standorte' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Marker Ben/ })).not.toBeInTheDocument();
  });

  it('Admin der Gruppe sieht die Positionen auch ohne Teilnahme', async () => {
    const s = setup(null, 'admin');
    renderApp(`/jagd/${s.huntId}`, s);
    const list = await screen.findByRole('list', { name: 'Live-Standorte' });
    expect(within(list).getByText('Ben')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Meinen Standort teilen' })).not.toBeInTheDocument();
  });

  it('weist vor Beginn auf das Teilen hin', async () => {
    const s = setup('treiber', 'member', 'geplant');
    renderApp(`/jagd/${s.huntId}`, s);
    expect(await screen.findByText(/Sobald die Jagd läuft, kannst du als Treiber/)).toBeInTheDocument();
  });

  it('beendet das Teilen, wenn die Jagd vorbei ist', async () => {
    const s = setup('treiber');
    renderApp(`/jagd/${s.huntId}`, s);
    await userEvent.click(await screen.findByRole('button', { name: 'Meinen Standort teilen' }));
    fix(51.17, 7.25);
    await screen.findByText(/Dein Standort wird geteilt/);
    s.hunts.hunts[0]!.status = 'beendet';
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    fix(51.2, 7.3);
    await vi.waitFor(() => expect(screen.queryByText(/Dein Standort wird geteilt/)).not.toBeInTheDocument());
  });
});
