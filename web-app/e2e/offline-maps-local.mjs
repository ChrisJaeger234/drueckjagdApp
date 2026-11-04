// Ende-zu-Ende-Test für Offline-Karten (Phase 7) gegen einen lokalen Supabase-Stack.
// Kachelserver werden im Test durch eine kleine PNG-Antwort ersetzt, damit der Test ohne
// Internet läuft und die Anbieter nicht belastet. Prüft: Paket laden, nach Neustart ohne Netz
// zeichnet die Karte aus dem Paket, Übersicht im Profil, Löschen beim Abmelden.
// Legt Testkonten in der LOKALEN Datenbank an; niemals gegen Produktion ausführen.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const URL = process.env.APP_URL ?? 'http://localhost:4181/';
if (!/localhost|127\.0\.0\.1/.test(URL)) throw new Error('Dieser Test läuft nur gegen eine lokale App.');

const check = (ok, msg) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
  if (!ok) process.exitCode = 1;
};
const visible = (locator, timeout = 10000) => locator.waitFor({ timeout }).then(() => true, () => false);

// Kleines Revier von etwa 600 x 550 m.
const kmlPath = join(tmpdir(), 'revier-offline.kml');
writeFileSync(
  kmlPath,
  `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Revier</name>
<Polygon><outerBoundaryIs><LinearRing><coordinates>7.245,51.166,0 7.254,51.166,0 7.254,51.171,0 7.245,51.171,0 7.245,51.166,0</coordinates></LinearRing></outerBoundaryIs></Polygon>
</Placemark></Document></kml>`,
);

// 1x1 Pixel PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const stamp = Date.now().toString(36);
const browser = await chromium.launch();
const errors = [];
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
let tileRequests = 0;
await context.route(/sgx\.geodatenzentrum\.de|wmts\.nrw\.de/, (route) => {
  tileRequests++;
  return route.fulfill({ status: 200, contentType: 'image/png', body: PNG, headers: { 'access-control-allow-origin': '*' } });
});
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));
// Phase 10: Verstöße gegen die Content-Security-Policy zählen als Fehler.
page.on('console', (m) => /Content Security Policy/i.test(m.text()) && errors.push(`CSP ${m.text()}`));

await page.goto(new globalThis.URL('registrieren', URL).toString());
await page.getByLabel('E-Mail').fill(`karte-${stamp}@example.com`);
await page.getByLabel('Passwort', { exact: true }).fill('waidmann1');
await page.getByLabel('Passwort bestätigen').fill('waidmann1');
await page.getByRole('button', { name: 'Registrieren' }).click();
await page.getByRole('heading', { level: 1, name: 'Profil' }).waitFor({ timeout: 10000 });
await page.getByLabel('Anzeigename').fill('Kartenleser');
await page.getByLabel('Benutzername').fill(`karte_${stamp}`.slice(0, 24));
await page.getByRole('button', { name: 'Speichern' }).click();
await page.getByText('@karte_').waitFor({ timeout: 10000 });

await page.getByRole('link', { name: 'Gruppe', exact: true }).click();
await page.getByRole('link', { name: 'Gruppe erstellen' }).click();
await page.getByLabel('Name der Gruppe').fill(`Karte ${stamp}`);
await page.getByRole('button', { name: 'Gruppe erstellen' }).click();
await page.getByRole('heading', { level: 1, name: `Karte ${stamp}` }).waitFor({ timeout: 10000 });
await page.getByRole('link', { name: 'Revier anlegen' }).click();
await page.getByLabel('Name des Reviers').fill('Hohe Buche');
await page.getByRole('button', { name: 'Revier anlegen' }).click();
await page.getByRole('heading', { level: 1, name: 'Hohe Buche' }).waitFor({ timeout: 10000 });
await page.getByTestId('boundary-file').setInputFiles(kmlPath);
await page.getByText('Reviergrenze aus „revier-offline.kml“ übernommen.').waitFor({ timeout: 10000 });
const revierUrl = page.url();
check(true, 'Revier mit Grenze angelegt');

const estimate = await page.getByTestId('pack-estimate').textContent();
check(/^\d+ Kacheln, etwa .* MB/.test(estimate ?? ''), `Schätzung angezeigt: ${estimate}`);
const before = tileRequests;
await page.getByRole('button', { name: 'Karte offline speichern' }).click();
const summary = page.getByTestId('pack-summary');
await summary.waitFor({ timeout: 30000 });
const summaryText = await summary.textContent();
const packTiles = Number(/([\d.]+) Kacheln/.exec(summaryText ?? '')?.[1]?.replace('.', ''));
check(packTiles > 0 && tileRequests - before >= packTiles, `Paket geladen: ${summaryText}`);
const cached = await page.evaluate(async () => {
  const names = (await caches.keys()).filter((n) => n.startsWith('map-pack:'));
  return names.length === 1 ? (await (await caches.open(names[0])).keys()).length : -1;
});
check(cached === packTiles, `Kacheln im Cache Storage: ${cached}`);

// Neustart ohne Netz: Seite kommt aus dem Service Worker, Kacheln aus dem Paket.
await context.setOffline(true);
await page.reload();
await page.getByRole('heading', { level: 1, name: 'Hohe Buche' }).waitFor({ timeout: 15000 });
const map = page.locator('[data-pack-tiles]');
const fromPack = await map
  .waitFor({ timeout: 20000 })
  .then(() => page.waitForFunction(() => Number(document.querySelector('[data-pack-tiles]')?.getAttribute('data-pack-tiles')) > 0, null, { timeout: 20000 }))
  .then(() => map.getAttribute('data-pack-tiles'), () => '0');
check(Number(fromPack) > 0, `Ohne Netz neu geladen: Karte zeichnet ${fromPack} Kacheln aus dem Paket`);
check(await visible(page.getByTestId('pack-summary')), 'Paketangaben auch ohne Netz vorhanden');
check(await page.getByRole('button', { name: 'Offline-Karte aktualisieren' }).isDisabled(), 'Aktualisieren ohne Netz gesperrt');

await page.getByRole('link', { name: 'Profil' }).click();
const list = page.getByRole('list', { name: 'Offline-Karten' });
check(await visible(list.getByRole('link', { name: 'Hohe Buche' })), 'Profil listet die Offline-Karte');

await context.setOffline(false);
await page.goto(revierUrl);
await page.getByRole('heading', { level: 1, name: 'Hohe Buche' }).waitFor({ timeout: 10000 });
await page.getByRole('link', { name: 'Profil' }).click();
await page.getByRole('button', { name: 'Abmelden' }).click();
await page.getByRole('heading', { level: 1, name: 'Anmelden' }).waitFor({ timeout: 10000 });
await page.waitForFunction(async () => !(await caches.keys()).some((n) => n.startsWith('map-pack:')), null, { timeout: 10000 }).catch(() => undefined);
const left = await page.evaluate(async () => (await caches.keys()).filter((n) => n.startsWith('map-pack:')).length);
check(left === 0, 'Beim Abmelden alle Offline-Karten gelöscht');

check(errors.length === 0, `keine Seitenfehler${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
