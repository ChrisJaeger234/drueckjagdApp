import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PACK_PREFIX } from '../../modules/map/tileStore';
import { installFakeCaches, removeFakeCaches, type FakeCacheStorage } from '../../test/fakeCaches';
import { FakeGroups, FakeProfiles, FakeReviere } from '../../test/fakes';
import { renderApp, signedIn } from '../../test/renderApp';

const kv = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: async (k: string) => kv.get(k),
  set: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  del: async (k: string) => void kv.delete(k),
}));

function setup() {
  const auth = signedIn();
  const profiles = new FakeProfiles();
  profiles.seed(auth.user!.id, { displayName: 'Max', username: 'max' });
  const groups = new FakeGroups(auth, profiles);
  const groupId = groups.seedGroup('Hegering Nord', [[auth.user!.id, 'member']]);
  const reviere = new FakeReviere(auth, groups);
  const revierId = reviere.seedRevier(groupId, 'Hohe Buche');
  reviere.seedWaypoint(revierId, { lat: 51.17, lng: 7.25 });
  reviere.seedWaypoint(revierId, { name: 'Bock 2', lat: 51.172, lng: 7.255 });
  return { auth, profiles, groups, reviere, revierId };
}

describe('Offline-Karten', () => {
  let store: FakeCacheStorage;
  let tileFetch: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    kv.clear();
    store = installFakeCaches();
    tileFetch = vi.fn(async () => new Response(new Uint8Array(2000), { headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', tileFetch);
  });
  afterEach(() => {
    removeFakeCaches();
    vi.unstubAllGlobals();
  });

  it('speichert die Karte eines Reviers und zeigt sie im Profil', async () => {
    const s = setup();
    renderApp(`/revier/${s.revierId}`, s);
    const card = (await screen.findByRole('heading', { name: 'Karte offline' })).closest('section, div')!.parentElement!;
    const estimate = await screen.findByTestId('pack-estimate');
    const standard = estimate.textContent!;
    await userEvent.click(screen.getByRole('checkbox', { name: 'Luftbild' }));
    expect(estimate.textContent).not.toBe(standard);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Luftbild' }));
    await userEvent.click(screen.getByRole('button', { name: 'Karte offline speichern' }));

    expect(await screen.findByTestId('pack-summary', {}, { timeout: 5000 })).toHaveTextContent(/^Karte, [\d.]+ Kacheln, .* MB, Stand/);
    expect(within(card).getByText('gespeichert')).toBeInTheDocument();
    expect(store.size(PACK_PREFIX + s.revierId)).toBe(tileFetch.mock.calls.length);
    expect(String(tileFetch.mock.calls[0]![0])).toContain('sgx.geodatenzentrum.de');
    expect(screen.getByRole('button', { name: 'Offline-Karte aktualisieren' })).toBeInTheDocument();
  });

  it('listet Pakete im Profil, löscht sie einzeln und beim Abmelden alle', async () => {
    const s = setup();
    renderApp(`/revier/${s.revierId}`, s);
    await userEvent.click(await screen.findByRole('button', { name: 'Karte offline speichern' }));
    await screen.findByTestId('pack-summary', {}, { timeout: 5000 });

    await userEvent.click(screen.getByRole('link', { name: /Profil/ }));
    const list = await screen.findByRole('list', { name: 'Offline-Karten' });
    expect(within(list).getByRole('link', { name: 'Hohe Buche' })).toBeInTheDocument();
    await userEvent.click(within(list).getByRole('button', { name: 'Löschen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(await screen.findByText(/Noch keine Karte gespeichert/)).toBeInTheDocument();
    expect(store.size(PACK_PREFIX + s.revierId)).toBe(0);
  });

  it('löscht beim Abmelden alle Offline-Karten', async () => {
    const s = setup();
    renderApp(`/revier/${s.revierId}`, s);
    await userEvent.click(await screen.findByRole('button', { name: 'Karte offline speichern' }));
    await screen.findByTestId('pack-summary', {}, { timeout: 5000 });
    expect(await store.keys()).toContain(PACK_PREFIX + s.revierId);
    await userEvent.click(screen.getByRole('link', { name: /Profil/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Abmelden' }));
    await screen.findByRole('heading', { level: 1, name: 'Anmelden' });
    await vi.waitFor(async () => expect(await store.keys()).toEqual([]));
    expect(kv.size).toBe(0);
  });

  it('weist ohne Gebiet darauf hin, zuerst Grenze oder Einrichtungen anzulegen', async () => {
    const s = setup();
    const empty = s.reviere.seedRevier(s.groups.groups.keys().next().value!, 'Leer');
    renderApp(`/revier/${empty}`, s);
    expect(await screen.findByText(/Lege zuerst eine Reviergrenze/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Karte offline speichern' })).not.toBeInTheDocument();
  });
});
