import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import maplibregl, { type GeoJSONSource, type StyleSpecification } from 'maplibre-gl';
import { gpx, kml } from '@tmcw/togeojson';
import { registerSW } from 'virtual:pwa-register';
import { addLog, allLogs, clearLogs, getKv, setKv, type LogEntry } from './db';
import {
  bboxOf, DEFAULT_BBOX, DEFAULT_CENTER, LAYERS, padBbox, tilesForBbox, tileUrl,
  type Bbox, type LayerId, type Tile,
} from './tiles';

// Öffentlicher VAPID-Schlüssel nur für diesen Test. Der private Schlüssel liegt nicht im Repository.
const VAPID_PUBLIC_KEY = 'BMNEc4fkN5OVQZAF1O5zx_azZe_AVK2WMBBZx0YUPrFDl2SuVK0lh2t_Y1kyElO-_SsNFiDi1PnET6-zswbxVFA';
const TILE_CACHE = 'tiles-v1';
const LAYER_IDS: LayerId[] = ['karte', 'luftbild'];

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString('de-DE');
const fmtMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

function setText(id: string, text: string, tone?: 'ok' | 'warn' | 'bad') {
  const el = $(id);
  el.textContent = text;
  el.dataset.tone = tone ?? '';
}

async function log(kind: LogEntry['kind'], text: string, data?: Record<string, unknown>) {
  try {
    await addLog({ kind, text, data });
  } catch (e) {
    console.error(e);
  }
  void renderLog();
}

// ---------------------------------------------------------------- Service Worker

registerSW({
  immediate: true,
  onRegisteredSW: () => void refreshStatus(),
  onOfflineReady: () => void log('info', 'App ist für den Offline-Start bereit.'),
});

// ---------------------------------------------------------------- Karte

for (const layer of LAYER_IDS) {
  maplibregl.addProtocol(layer, async (params, abort) => {
    const m = /:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!m) throw new Error(`Ungültige Kachel ${params.url}`);
    const url = tileUrl(layer, { z: Number(m[1]), x: Number(m[2]), y: Number(m[3]) });
    // Zuerst das Offline-Paket, dann das Netz. Angesehene Kacheln landen bewusst nicht im
    // Paket, damit der Test zeigt, was das Paket allein leistet.
    const cached = 'caches' in window ? await (await caches.open(TILE_CACHE)).match(url) : undefined;
    const res = cached ?? (await fetch(url, { signal: abort.signal }));
    if (!res.ok) throw new Error(`Kachel ${res.status}`);
    return { data: await res.arrayBuffer() };
  });
}

const style: StyleSpecification = {
  version: 8,
  sources: Object.fromEntries(
    LAYER_IDS.map((id) => [
      id,
      { type: 'raster', tiles: [`${id}://{z}/{x}/{y}`], tileSize: 256, maxzoom: LAYERS[id].maxzoom, attribution: LAYERS[id].attribution },
    ]),
  ),
  layers: LAYER_IDS.map((id) => ({ id, type: 'raster', source: id, layout: { visibility: id === 'karte' ? 'visible' : 'none' } })),
};

const map = new maplibregl.Map({
  container: 'map',
  style,
  center: [DEFAULT_CENTER.lon, DEFAULT_CENTER.lat],
  zoom: 13,
  maxZoom: 19,
  attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

const emptyFc = (): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: [] });

map.on('load', async () => {
  map.addSource('revier', { type: 'geojson', data: emptyFc() });
  map.addLayer({ id: 'revier-fill', type: 'fill', source: 'revier', paint: { 'fill-color': '#e0a526', 'fill-opacity': 0.12 } });
  map.addLayer({ id: 'revier-line', type: 'line', source: 'revier', paint: { 'line-color': '#e0a526', 'line-width': 3 } });
  map.addSource('me', { type: 'geojson', data: emptyFc() });
  map.addLayer({
    id: 'me-accuracy', type: 'circle', source: 'me',
    paint: { 'circle-radius': ['get', 'px'], 'circle-color': '#2f7de1', 'circle-opacity': 0.15 },
  });
  map.addLayer({
    id: 'me', type: 'circle', source: 'me',
    paint: { 'circle-radius': 7, 'circle-color': '#2f7de1', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
  });
  const revier = await getKv<GeoJSON.FeatureCollection>('revier');
  if (revier) showRevier(revier, false);
});

function selectLayer(id: LayerId) {
  for (const l of LAYER_IDS) map.setLayoutProperty(l, 'visibility', l === id ? 'visible' : 'none');
  document.querySelectorAll<HTMLButtonElement>('[data-layer]').forEach((b) => b.classList.toggle('active', b.dataset.layer === id));
}
document.querySelectorAll<HTMLButtonElement>('[data-layer]').forEach((b) =>
  b.addEventListener('click', () => selectLayer(b.dataset.layer as LayerId)),
);

let revierBbox: Bbox | null = null;

function showRevier(fc: GeoJSON.FeatureCollection, fit = true) {
  (map.getSource('revier') as GeoJSONSource | undefined)?.setData(fc);
  revierBbox = bboxOf(fc);
  if (revierBbox && fit) map.fitBounds([[revierBbox.west, revierBbox.south], [revierBbox.east, revierBbox.north]], { padding: 30 });
  void updatePackEstimate();
}

$('file').addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    const fc = (file.name.toLowerCase().endsWith('.gpx') ? gpx(doc) : kml(doc)) as GeoJSON.FeatureCollection;
    if (!fc.features.length) throw new Error('Keine Geometrien in der Datei gefunden.');
    await setKv('revier', fc);
    showRevier(fc);
    await log('info', `Datei „${file.name}“ geladen: ${fc.features.length} Objekt(e). Sie bleibt nur auf diesem Gerät.`);
  } catch (err) {
    await log('error', `Datei konnte nicht gelesen werden: ${(err as Error).message}`);
  }
});

// ---------------------------------------------------------------- Offline-Kartenpaket

function packPlan(): { bbox: Bbox; tiles: { layer: LayerId; tile: Tile }[] } {
  const bbox = revierBbox ? padBbox(revierBbox) : DEFAULT_BBOX;
  const maxZoom = Number($<HTMLSelectElement>('pack-zoom').value);
  const layers = LAYER_IDS.filter((l) => $<HTMLInputElement>(`pack-${l}`).checked);
  const tiles = layers.flatMap((layer) => tilesForBbox(bbox, 10, Math.min(maxZoom, LAYERS[layer].maxzoom)).map((tile) => ({ layer, tile })));
  return { bbox, tiles };
}

async function updatePackEstimate() {
  const { tiles } = packPlan();
  // Erfahrungswerte aus Stichproben: Karte ca. 15 KB, Luftbild ca. 28 KB je Kachel.
  const bytes = tiles.reduce((s, t) => s + (t.layer === 'karte' ? 15_000 : 28_000), 0);
  setText('pack-estimate', `${tiles.length} Kacheln, geschätzt ${fmtMb(bytes)} · Gebiet: ${revierBbox ? 'Revier aus Datei' : 'Standardgebiet um den Reviermittelpunkt'}`);
}
['pack-zoom', 'pack-karte', 'pack-luftbild'].forEach((id) => $(id).addEventListener('change', () => void updatePackEstimate()));

let packRunning = false;
$('pack-load').addEventListener('click', async () => {
  if (packRunning) return;
  packRunning = true;
  const btn = $<HTMLButtonElement>('pack-load');
  btn.disabled = true;
  const { tiles } = packPlan();
  const cache = await caches.open(TILE_CACHE);
  let doneCount = 0, failed = 0, bytes = 0;
  const started = Date.now();
  const queue = [...tiles];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const url = tileUrl(item.layer, item.tile);
      try {
        const hit = await cache.match(url);
        if (hit) {
          bytes += Number(hit.headers.get('content-length') ?? 0);
        } else {
          const res = await fetch(url);
          if (!res.ok) throw new Error(String(res.status));
          const blob = await res.blob();
          bytes += blob.size;
          await cache.put(url, new Response(blob, { headers: { 'content-type': blob.type, 'content-length': String(blob.size) } }));
        }
      } catch {
        failed++;
      }
      doneCount++;
      if (doneCount % 10 === 0 || doneCount === tiles.length) {
        setText('pack-progress', `${doneCount} / ${tiles.length} Kacheln · ${fmtMb(bytes)}${failed ? ` · ${failed} fehlgeschlagen` : ''}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  const seconds = Math.round((Date.now() - started) / 1000);
  await setKv('pack', { tiles: tiles.length, failed, bytes, at: Date.now() });
  await log(failed ? 'error' : 'info', `Offline-Paket: ${tiles.length - failed} von ${tiles.length} Kacheln, ${fmtMb(bytes)} in ${seconds} s.`);
  setText('pack-progress', `Fertig: ${tiles.length - failed} Kacheln, ${fmtMb(bytes)} in ${seconds} s`, failed ? 'warn' : 'ok');
  btn.disabled = false;
  packRunning = false;
  void refreshStatus();
});

$('pack-clear').addEventListener('click', async () => {
  await caches.delete(TILE_CACHE);
  await setKv('pack', null);
  setText('pack-progress', 'Offline-Paket gelöscht.');
  await log('info', 'Offline-Paket gelöscht.');
  void refreshStatus();
});

// ---------------------------------------------------------------- GPS

let watchId: number | null = null;
let lastTick = Date.now();
let firstFixCentered = false;

function metersToPixels(m: number, lat: number) {
  const mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** map.getZoom();
  return Math.max(7, m / mpp);
}

$('gps-toggle').addEventListener('click', () => {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    $('gps-toggle').textContent = 'GPS starten';
    void log('gps', 'GPS gestoppt.', { type: 'stop' });
    return;
  }
  if (!('geolocation' in navigator)) {
    setText('gps-status', 'Dieser Browser kennt keine Ortung.', 'bad');
    return;
  }
  firstFixCentered = false;
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      void addLog({ kind: 'gps', text: 'Position', at: pos.timestamp, data: { type: 'fix', lat: latitude, lon: longitude, accuracy, hidden: document.hidden } });
      setText('gps-status', `${latitude.toFixed(5)}, ${longitude.toFixed(5)} · ±${Math.round(accuracy)} m · ${fmtTime(pos.timestamp)}`, accuracy < 30 ? 'ok' : 'warn');
      (map.getSource('me') as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: { px: metersToPixels(accuracy, latitude) }, geometry: { type: 'Point', coordinates: [longitude, latitude] } }],
      });
      if (!firstFixCentered) {
        firstFixCentered = true;
        map.easeTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), 15) });
      }
      void renderGpsStats();
    },
    (err) => {
      setText('gps-status', `Fehler: ${err.message} (Code ${err.code})`, 'bad');
      void log('error', `GPS-Fehler: ${err.message} (Code ${err.code})`);
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
  );
  $('gps-toggle').textContent = 'GPS stoppen';
  void log('gps', 'GPS gestartet.', { type: 'start' });
});

// Taktgeber: Wenn der Browser die App anhält (Bildschirm gesperrt, App im Hintergrund),
// laufen keine Timer. Die Lücke beim Fortsetzen zeigt, wie lange die App pausiert war.
setInterval(() => {
  const now = Date.now();
  const gap = now - lastTick;
  if (gap > 15_000) {
    void log('visibility', `App war ${Math.round(gap / 1000)} s angehalten (${fmtTime(lastTick)} bis ${fmtTime(now)}).`, { type: 'pause', from: lastTick, to: now, gpsActive: watchId !== null });
  }
  lastTick = now;
}, 5_000);

document.addEventListener('visibilitychange', () => {
  void log('visibility', document.hidden ? 'App verborgen (Bildschirm aus oder andere App).' : 'App wieder sichtbar.', { type: document.hidden ? 'hidden' : 'visible', gpsActive: watchId !== null });
  if (!document.hidden && wakeWanted) void requestWakeLock();
});

async function gpsStats() {
  const logs = await allLogs('gps');
  const fixes = logs.filter((l) => l.data?.type === 'fix');
  const pauses = (await allLogs('visibility')).filter((l) => l.data?.type === 'pause' && l.data?.gpsActive);
  const fixesDuringPauses = pauses.map((p) => ({
    seconds: Math.round(((p.data!.to as number) - (p.data!.from as number)) / 1000),
    fixes: fixes.filter((f) => f.at > (p.data!.from as number) + 5_000 && f.at < (p.data!.to as number) - 1_000).length,
  }));
  const hiddenFixes = fixes.filter((f) => f.data?.hidden).length;
  const best = fixes.reduce((m, f) => Math.min(m, Number(f.data?.accuracy ?? Infinity)), Infinity);
  return { fixes: fixes.length, hiddenFixes, best, pauses: fixesDuringPauses };
}

async function renderGpsStats() {
  const s = await gpsStats();
  const pauseText = s.pauses.length
    ? s.pauses.map((p) => `${p.seconds} s Pause mit ${p.fixes} Positionen`).join(' · ')
    : 'noch keine Pause gemessen';
  setText('gps-stats', `${s.fixes} Positionen, davon ${s.hiddenFixes} bei verborgener App · beste Genauigkeit ${Number.isFinite(s.best) ? `±${Math.round(s.best)} m` : '–'} · ${pauseText}`);
}

// ---------------------------------------------------------------- Display wachhalten

let wakeLock: WakeLockSentinel | null = null;
let wakeWanted = false;

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) {
    setText('wake-status', 'Nicht unterstützt (Wake Lock API fehlt).', 'bad');
    return;
  }
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    setText('wake-status', `Aktiv seit ${fmtTime(Date.now())}. Der Bildschirm sollte nicht mehr ausgehen.`, 'ok');
    wakeLock.addEventListener('release', () => {
      setText('wake-status', `Freigegeben um ${fmtTime(Date.now())}.`, wakeWanted ? 'warn' : undefined);
      void log('wakelock', 'Display-Sperre wurde freigegeben.');
    });
    void log('wakelock', 'Display wird wachgehalten.');
  } catch (e) {
    setText('wake-status', `Fehler: ${(e as Error).message}`, 'bad');
    void log('error', `Wake Lock: ${(e as Error).message}`);
  }
}

$('wake-toggle').addEventListener('click', async () => {
  wakeWanted = !wakeWanted;
  $('wake-toggle').textContent = wakeWanted ? 'Display freigeben' : 'Display wachhalten';
  if (wakeWanted) await requestWakeLock();
  else await wakeLock?.release();
});

// ---------------------------------------------------------------- Benachrichtigungen und Push

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

$('notify-local').addEventListener('click', async () => {
  if (!('Notification' in window)) {
    setText('notify-status', isStandalone() ? 'Benachrichtigungen werden nicht unterstützt.' : 'Auf dem iPhone erst nach „Zum Home-Bildschirm“ verfügbar.', 'bad');
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    setText('notify-status', `Erlaubnis: ${permission}`, 'bad');
    return;
  }
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('Drückjagd-Test', { body: 'Lokale Testbenachrichtigung angekommen.', icon: 'icon-192.png', tag: 'local-test' });
  setText('notify-status', 'Erlaubt, Testbenachrichtigung gesendet.', 'ok');
  void log('info', 'Lokale Benachrichtigung gesendet.');
});

$('push-subscribe').addEventListener('click', async () => {
  try {
    if (!('PushManager' in window)) throw new Error(isStandalone() ? 'Push wird nicht unterstützt.' : 'Auf dem iPhone erst nach „Zum Home-Bildschirm“ verfügbar.');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error(`Erlaubnis: ${permission}`);
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }));
    $<HTMLTextAreaElement>('push-json').value = JSON.stringify(sub.toJSON());
    $('push-json').hidden = false;
    setText('push-status', 'Abonniert. Den Text unten kopieren und im Chat schicken; dann kommt eine echte Push-Nachricht.', 'ok');
    void log('info', 'Push abonniert.');
  } catch (e) {
    setText('push-status', (e as Error).message, 'bad');
    void log('error', `Push: ${(e as Error).message}`);
  }
});

// ---------------------------------------------------------------- Offline-Meldungen

async function renderReports() {
  const reports = await allLogs('report');
  setText('report-status', reports.length
    ? `${reports.length} Testmeldung(en) gespeichert, zuletzt ${fmtTime(reports.at(-1)!.at)}. Sie bleiben auch nach Neustart der App erhalten.`
    : 'Noch keine Testmeldung gespeichert.');
}

$('report-add').addEventListener('click', async () => {
  const fix = (await allLogs('gps')).filter((l) => l.data?.type === 'fix').at(-1);
  await log('report', `Testmeldung „Stück erlegt“ ${navigator.onLine ? 'mit' : 'ohne'} Netz`, { online: navigator.onLine, lat: fix?.data?.lat, lon: fix?.data?.lon });
  void renderReports();
});

// ---------------------------------------------------------------- Status und Bericht

async function storageInfo() {
  const est = await navigator.storage?.estimate?.();
  const persisted = await navigator.storage?.persisted?.();
  const pack = await getKv<{ tiles: number; failed: number; bytes: number; at: number } | null>('pack');
  return { est, persisted, pack };
}

async function refreshStatus() {
  setText('st-mode', isStandalone() ? 'vom Home-Bildschirm gestartet' : 'im Browser-Tab (für Push auf dem iPhone bitte zum Home-Bildschirm hinzufügen)', isStandalone() ? 'ok' : 'warn');
  setText('st-net', navigator.onLine ? 'online' : 'offline', navigator.onLine ? 'ok' : 'warn');
  const reg = await navigator.serviceWorker?.getRegistration();
  setText('st-sw', reg?.active ? 'aktiv, App startet offline' : 'noch nicht aktiv', reg?.active ? 'ok' : 'warn');
  const { est, persisted, pack } = await storageInfo();
  setText('st-storage', est ? `${fmtMb(est.usage ?? 0)} belegt von ca. ${fmtMb(est.quota ?? 0)} · ${persisted ? 'dauerhaft geschützt' : 'nicht dauerhaft geschützt'}` : 'unbekannt', persisted ? 'ok' : 'warn');
  setText('st-pack', pack ? `${pack.tiles - pack.failed} Kacheln (${fmtMb(pack.bytes)}) vom ${new Date(pack.at).toLocaleString('de-DE')}` : 'keins geladen', pack ? 'ok' : undefined);
  $('install-hint').hidden = isStandalone();
}
window.addEventListener('online', () => { void refreshStatus(); void log('info', 'Netz ist zurück.'); });
window.addEventListener('offline', () => { void refreshStatus(); void log('info', 'Netz ist weg.'); });

$('persist').addEventListener('click', async () => {
  const ok = await navigator.storage?.persist?.();
  await log('info', `Dauerhafter Speicher angefragt: ${ok ? 'gewährt' : 'abgelehnt'}`);
  void refreshStatus();
});

async function buildReport() {
  const { est, persisted, pack } = await storageInfo();
  const gps = await gpsStats();
  const logs = await allLogs();
  const reports = logs.filter((l) => l.kind === 'report');
  const lines = [
    'Drückjagd PWA-Test, Ergebnis',
    `Zeit: ${new Date().toLocaleString('de-DE')}`,
    `Gerät: ${navigator.userAgent}`,
    `Start: ${isStandalone() ? 'Home-Bildschirm' : 'Browser-Tab'} · Netz: ${navigator.onLine ? 'online' : 'offline'}`,
    `Service Worker: ${(await navigator.serviceWorker?.getRegistration())?.active ? 'aktiv' : 'nicht aktiv'}`,
    `Speicher: ${est ? `${fmtMb(est.usage ?? 0)} / ${fmtMb(est.quota ?? 0)}` : 'unbekannt'} · persist: ${persisted}`,
    `Offline-Paket: ${pack ? `${pack.tiles - pack.failed}/${pack.tiles} Kacheln, ${fmtMb(pack.bytes)}` : 'keins'}`,
    `GPS: ${gps.fixes} Positionen, ${gps.hiddenFixes} bei verborgener App, beste Genauigkeit ${Number.isFinite(gps.best) ? Math.round(gps.best) + ' m' : '–'}`,
    `GPS-Pausen: ${gps.pauses.map((p) => `${p.seconds}s/${p.fixes} Pos.`).join(', ') || 'keine'}`,
    `Wake Lock: ${'wakeLock' in navigator ? 'vorhanden' : 'fehlt'} · Notification: ${'Notification' in window ? Notification.permission : 'fehlt'} · Push: ${'PushManager' in window ? 'vorhanden' : 'fehlt'}`,
    `Testmeldungen: ${reports.length} (${reports.filter((r) => r.data?.online === false).length} ohne Netz)`,
    '',
    'Letzte Ereignisse:',
    ...logs.filter((l) => l.kind !== 'gps' || l.data?.type !== 'fix').slice(-25).map((l) => `${fmtTime(l.at)} ${l.kind}: ${l.text}`),
  ];
  return lines.join('\n');
}

$('report-build').addEventListener('click', async () => {
  const text = await buildReport();
  const area = $<HTMLTextAreaElement>('report-text');
  area.value = text;
  area.hidden = false;
  try {
    await navigator.clipboard.writeText(text);
    setText('report-copy', 'In die Zwischenablage kopiert. Einfach im Chat einfügen.', 'ok');
  } catch {
    area.select();
    setText('report-copy', 'Bitte den Text markieren und kopieren.', 'warn');
  }
});

$('log-clear').addEventListener('click', async () => {
  await clearLogs();
  void renderLog();
  void renderGpsStats();
  void renderReports();
});

async function renderLog() {
  const logs = (await allLogs()).filter((l) => l.kind !== 'gps' || l.data?.type !== 'fix').slice(-30).reverse();
  $('log').replaceChildren(
    ...logs.map((l) => {
      const li = document.createElement('li');
      li.dataset.kind = l.kind;
      li.textContent = `${fmtTime(l.at)} · ${l.text}`;
      return li;
    }),
  );
}

void refreshStatus();
void renderLog();
void renderGpsStats();
void renderReports();
void updatePackEstimate();
void log('info', `App gestartet (${isStandalone() ? 'Home-Bildschirm' : 'Browser-Tab'}, ${navigator.onLine ? 'online' : 'offline'}).`);
