import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeCaches, removeFakeCaches, type FakeCacheStorage } from '../../test/fakeCaches';
import { latToTileY, lonToTileX, padBbox, tilesForBbox } from './geo';
import { baseStyle, parseProtocolUrl, tileUrl } from './layers';
import { countPack, deleteAllPacks, deletePack, downloadPack, listPacks, loadTile, MAX_PACK_TILES, PACK_PREFIX, planPack } from './tileStore';

const kv = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: async (k: string) => kv.get(k),
  set: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  del: async (k: string) => void kv.delete(k),
}));

// Kleines Gebiet von etwa 600 x 600 m.
const BBOX = { west: 7.245, south: 51.166, east: 7.254, north: 51.171 };
// Uint8Array statt Blob: der Blob von jsdom passt nicht zur Response von Node.
const png = () => new Response(new Uint8Array(100), { status: 200, headers: { 'content-type': 'image/png' } });

describe('Kachel-Mathematik', () => {
  it('rechnet Längen und Breiten in Kachelnummern um', () => {
    expect(lonToTileX(0, 1)).toBe(1);
    expect(latToTileY(0, 1)).toBe(1);
    expect(lonToTileX(7.25, 16)).toBe(34087);
  });

  it('zählt Kacheln je Zoomstufe', () => {
    const tiles = tilesForBbox(BBOX, 10, 12);
    expect(tiles.every((t) => t.z >= 10 && t.z <= 12)).toBe(true);
    expect(tiles.filter((t) => t.z === 10)).toHaveLength(1);
  });

  it('vergrößert ein Gebiet um einen Rand in Metern', () => {
    const p = padBbox(BBOX, 500);
    expect(p.north - BBOX.north).toBeCloseTo(0.00449, 4);
    expect(BBOX.west - p.west).toBeGreaterThan(p.north - BBOX.north);
  });

  it('plant je Kartentyp nur Zoomstufen, die der Anbieter hat', () => {
    expect(planPack(BBOX, ['karte'], 19).some((t) => t.tile.z === 19)).toBe(false);
    expect(planPack(BBOX, ['luftbild'], 19).some((t) => t.tile.z === 19)).toBe(true);
    expect(planPack(BBOX, ['karte', 'luftbild'], 17).length).toBe(planPack(BBOX, ['karte'], 17).length * 2);
  });

  it('übersetzt Protokoll-URLs und Stile', () => {
    expect(parseProtocolUrl('basemap://16/34639/21900')).toEqual({ layer: 'karte', tile: { z: 16, x: 34639, y: 21900 } });
    expect(parseProtocolUrl('nrwdop://16/1/2')?.layer).toBe('luftbild');
    expect(parseProtocolUrl('https://example.com/1/2/3')).toBeNull();
    expect(baseStyle('luftbild').sources.base).toMatchObject({ tiles: ['nrwdop://{z}/{x}/{y}'], minzoom: 5 });
    expect(tileUrl('karte', { z: 16, x: 1, y: 2 })).toMatch(/GLOBAL_WEBMERCATOR\/16\/2\/1\.png$/);
  });
});

describe('Offline-Pakete', () => {
  let store: FakeCacheStorage;
  beforeEach(() => {
    kv.clear();
    store = installFakeCaches();
  });
  afterEach(() => {
    removeFakeCaches();
    vi.unstubAllGlobals();
  });

  const req = { revierId: 'r1', name: 'Hohe Buche', bbox: BBOX, layers: ['karte' as const], maxZoom: 15 };

  it('lädt alle Kacheln in einen eigenen Cache und merkt sich das Paket', async () => {
    const fetchFn = vi.fn(async () => png());
    const progress = vi.fn();
    const pack = await downloadPack(req, { fetchFn, onProgress: progress });
    const total = planPack(BBOX, ['karte'], 15).length;
    expect(fetchFn).toHaveBeenCalledTimes(total);
    expect(store.size(PACK_PREFIX + 'r1')).toBe(total);
    expect(pack).toMatchObject({ tiles: total, failed: 0, bytes: total * 100, complete: true });
    expect(progress).toHaveBeenLastCalledWith({ done: total, total, failed: 0, bytes: total * 100 });
    expect(await listPacks()).toEqual([pack]);
  });

  it('behält beim Aktualisieren alte Kacheln, wenn der Abruf scheitert', async () => {
    await downloadPack(req, { fetchFn: async () => png() });
    const pack = await downloadPack(req, { fetchFn: async () => new Response(null, { status: 503 }) });
    expect(pack.failed).toBe(0);
    expect(pack.bytes).toBe(pack.tiles * 100);
  });

  it('zählt fehlende Kacheln', async () => {
    let n = 0;
    const pack = await downloadPack(req, { fetchFn: async () => (n++ === 0 ? new Response(null, { status: 404 }) : png()) });
    expect(pack.failed).toBe(1);
    expect(pack.complete).toBe(true);
  });

  it('speichert bei Abbruch den bisherigen Stand als unvollständig', async () => {
    const ctrl = new AbortController();
    let n = 0;
    const pack = await downloadPack(req, {
      signal: ctrl.signal,
      fetchFn: async () => {
        if (++n === 3) ctrl.abort();
        return png();
      },
    });
    expect(pack.complete).toBe(false);
    expect(pack.failed).toBeGreaterThan(0);
  });

  it('lehnt zu große Gebiete ab', async () => {
    const huge = { ...req, bbox: { west: 6, south: 50, east: 9, north: 52 }, maxZoom: 18 };
    expect(countPack(huge.bbox, huge.layers, 18)).toBeGreaterThan(MAX_PACK_TILES);
    expect(countPack(BBOX, ['karte'], 15)).toBe(planPack(BBOX, ['karte'], 15).length);
    await expect(downloadPack(huge, { fetchFn: async () => png() })).rejects.toThrow(/zu groß/);
  });

  it('löscht einzelne und beim Abmelden alle Pakete', async () => {
    await downloadPack(req, { fetchFn: async () => png() });
    await downloadPack({ ...req, revierId: 'r2', name: 'Am Bach' }, { fetchFn: async () => png() });
    await store.open('workbox-precache');
    await deletePack('r1');
    expect((await listPacks()).map((p) => p.revierId)).toEqual(['r2']);
    expect(store.size(PACK_PREFIX + 'r1')).toBe(0);
    await deleteAllPacks();
    expect(await listPacks()).toEqual([]);
    expect(await store.keys()).toEqual(['workbox-precache']);
  });

  it('liest Kacheln zuerst aus dem Paket, sonst aus dem Netz', async () => {
    const tile = planPack(BBOX, ['karte'], 15)[0]!.tile;
    await downloadPack(req, { fetchFn: async () => png() });
    const net = vi.fn(async () => new Response(new Uint8Array(7)));
    vi.stubGlobal('fetch', net);
    expect((await loadTile('karte', tile)).byteLength).toBe(100);
    expect(net).not.toHaveBeenCalled();
    expect((await loadTile('karte', { z: 3, x: 1, y: 1 })).byteLength).toBe(7);
    expect(net).toHaveBeenCalledTimes(1);
  });
});
