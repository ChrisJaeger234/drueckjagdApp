// Offline-Kartenpakete (Phase 7): Kacheln eines Reviers vorab auf das Gerät laden.
//
// * Jedes Paket liegt in einem eigenen Cache-Storage-Cache `map-pack:<revierId>`. So lässt sich ein
//   Paket als Ganzes löschen, ohne Kacheln anderer Pakete anzufassen.
// * Die Karte liest jede Kachel zuerst aus allen Paketen (`caches.match`), erst dann aus dem Netz.
// * Angaben zu den Paketen (Gebiet, Größe, Datum) stehen in IndexedDB.
// * Beim Abmelden werden alle Pakete gelöscht (OfflineSync).
import { del, get, set } from 'idb-keyval';
import { countTiles, tilesForBbox, type Bbox } from './geo';
import { LAYERS, tileUrl, type LayerId, type Tile } from './layers';

export const PACK_PREFIX = 'map-pack:';
const META_KEY = 'drueckjagd-map-packs';
/** Unterhalb dieser Stufe deckt eine Kachel ohnehin ein großes Gebiet ab. */
export const PACK_MIN_ZOOM = 10;
/** Schutz vor versehentlich riesigen Paketen (etwa 300 MB beim Luftbild). */
export const MAX_PACK_TILES = 12_000;
const PARALLEL = 6;

export interface OfflinePack {
  revierId: string;
  name: string;
  bbox: Bbox;
  layers: LayerId[];
  maxZoom: number;
  tiles: number;
  failed: number;
  bytes: number;
  savedAt: string;
  /** false, wenn der Download abgebrochen wurde. */
  complete: boolean;
}

export interface PackRequest {
  revierId: string;
  name: string;
  bbox: Bbox;
  layers: LayerId[];
  maxZoom: number;
}

export interface PackProgress {
  done: number;
  total: number;
  failed: number;
  bytes: number;
}

export interface PlannedTile {
  layer: LayerId;
  tile: Tile;
}

const zoomRange = (layer: LayerId, maxZoom: number) => [Math.max(PACK_MIN_ZOOM, LAYERS[layer].minzoom), Math.min(maxZoom, LAYERS[layer].maxzoom)] as const;

/** Anzahl der Kacheln, ohne sie aufzuzählen (für die Schätzung bei großen Gebieten). */
export function countPack(bbox: Bbox, layers: LayerId[], maxZoom: number): number {
  return layers.reduce((sum, layer) => {
    const [min, max] = zoomRange(layer, maxZoom);
    return sum + countTiles(bbox, min, max);
  }, 0);
}

export function planPack(bbox: Bbox, layers: LayerId[], maxZoom: number): PlannedTile[] {
  if (countPack(bbox, layers, maxZoom) > MAX_PACK_TILES) throw new Error('Das Gebiet ist zu groß für ein Offline-Paket.');
  return layers.flatMap((layer) => tilesForBbox(bbox, ...zoomRange(layer, maxZoom)).map((tile) => ({ layer, tile })));
}

export const estimatePack = (bbox: Bbox, layers: LayerId[], maxZoom: number) =>
  layers.reduce((sum, layer) => {
    const [min, max] = zoomRange(layer, maxZoom);
    return sum + countTiles(bbox, min, max) * LAYERS[layer].avgTileBytes;
  }, 0);

export const formatMb = (bytes: number) =>
  bytes > 0 && bytes < 100 * 1024 ? 'unter 0,1 MB' : `${(bytes / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`;

export const offlineMapsSupported = () => typeof caches !== 'undefined';

async function readMeta(): Promise<Record<string, OfflinePack>> {
  try {
    return (await get<Record<string, OfflinePack>>(META_KEY)) ?? {};
  } catch {
    return {};
  }
}

async function writeMeta(meta: Record<string, OfflinePack>) {
  try {
    await set(META_KEY, meta);
  } catch {
    // Ohne IndexedDB bleiben nur die Kacheln; die Übersicht fehlt dann.
  }
}

export async function listPacks(): Promise<OfflinePack[]> {
  return Object.values(await readMeta()).sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export async function getPack(revierId: string): Promise<OfflinePack | null> {
  return (await readMeta())[revierId] ?? null;
}

/**
 * Lädt alle Kacheln des Pakets. Vorhandene Kacheln werden beim Aktualisieren neu geholt; schlägt
 * das fehl, bleibt die alte Kachel erhalten. Ein Abbruch speichert den bisherigen Stand.
 */
export async function downloadPack(
  req: PackRequest,
  { signal, onProgress, fetchFn = fetch }: { signal?: AbortSignal; onProgress?: (p: PackProgress) => void; fetchFn?: typeof fetch } = {},
): Promise<OfflinePack> {
  const plan = planPack(req.bbox, req.layers, req.maxZoom);
  const cache = await caches.open(PACK_PREFIX + req.revierId);
  void navigator.storage?.persist?.().catch(() => false);
  const progress: PackProgress = { done: 0, total: plan.length, failed: 0, bytes: 0 };
  const queue = [...plan];

  const worker = async () => {
    for (let item = queue.shift(); item && !signal?.aborted; item = queue.shift()) {
      const url = tileUrl(item.layer, item.tile);
      try {
        const res = await fetchFn(url, { signal });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        await cache.put(url, new Response(blob, { headers: { 'content-type': blob.type || 'image/png', 'content-length': String(blob.size) } }));
        progress.bytes += blob.size;
      } catch {
        if (signal?.aborted) break;
        // Alte Kachel behalten, falls vorhanden.
        const old = await cache.match(url);
        if (old) progress.bytes += Number(old.headers.get('content-length') ?? 0);
        else progress.failed++;
      }
      progress.done++;
      onProgress?.({ ...progress });
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));

  const pack: OfflinePack = {
    ...req,
    tiles: plan.length,
    failed: progress.failed + (plan.length - progress.done),
    bytes: progress.bytes,
    savedAt: new Date().toISOString(),
    complete: !signal?.aborted && progress.done === plan.length,
  };
  const meta = await readMeta();
  meta[req.revierId] = pack;
  await writeMeta(meta);
  return pack;
}

export async function deletePack(revierId: string) {
  await caches.delete(PACK_PREFIX + revierId);
  const meta = await readMeta();
  delete meta[revierId];
  await writeMeta(meta);
}

/** Beim Abmelden: alle Pakete vom Gerät entfernen. */
export async function deleteAllPacks() {
  try {
    if (offlineMapsSupported()) {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith(PACK_PREFIX)).map((n) => caches.delete(n)));
    }
    await del(META_KEY);
  } catch {
    // Ohne Cache Storage bzw. IndexedDB gibt es nichts zu löschen.
  }
}

/** Zähler für Tests und Fehlersuche: woher die Karte ihre Kacheln bekam. */
export const tileStats = { pack: 0, network: 0 };

/** Kachel für die Karte: zuerst aus einem Offline-Paket, sonst aus dem Netz. */
export async function loadTile(layer: LayerId, tile: Tile, signal?: AbortSignal): Promise<ArrayBuffer> {
  const url = tileUrl(layer, tile);
  if (offlineMapsSupported()) {
    const hit = await caches.match(url).catch(() => undefined);
    if (hit) {
      tileStats.pack++;
      return hit.arrayBuffer();
    }
  }
  const res = await fetch(url, { signal });
  tileStats.network++;
  if (!res.ok) throw new Error(`Kachel ${res.status}`);
  return res.arrayBuffer();
}
