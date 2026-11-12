// Ende-zu-Ende-Test für Reviere und Karte gegen einen lokalen Supabase-Stack (Aufbau wie e2e/auth-local.mjs).
// Mit echter MapLibre-Karte im Chromium: Revier anlegen, Grenze zeichnen und importieren
// (Normalisierung durch den Trigger aus Migration 0009), Einrichtung setzen, Mitglied sieht alles
// nur lesend, Übersichtskarte, eigener Standort (simuliert).
// Legt Testkonten in der LOKALEN Datenbank an; niemals gegen Produktion ausführen.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const URL = process.env.APP_URL ?? 'http://localhost:4181/';
const shot = process.env.SHOT_DIR;
if (!/localhost|127\.0\.0\.1/.test(URL)) throw new Error('Dieser Test läuft nur gegen eine lokale App.');

const check = (ok, msg) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
  if (!ok) process.exitCode = 1;
};

const kmlPath = join(tmpdir(), 'revier-test.kml');
writeFileSync(
  kmlPath,
  `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Revier</name>
<Polygon><outerBoundaryIs><LinearRing><coordinates>7.235,51.160,0 7.260,51.160,0 7.260,51.178,0 7.235,51.178,0 7.235,51.160,0</coordinates></LinearRing></outerBoundaryIs></Polygon>
</Placemark></Document></kml>`,
);

// Wartet auf das Element, statt nur den Moment abzufragen (Daten kommen aus getrennten Abfragen).
const visible = (locator) => locator.waitFor({ timeout: 10000 }).then(() => true, () => false);

const stamp = Date.now().toString(36);
const browser = await chromium.launch();
const errors = [];

async function newUser(name, options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...options });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  // Phase 10: Verstöße gegen die Content-Security-Policy zählen als Fehler.
  page.on('console', (m) => /Content Security Policy/i.test(m.text()) && errors.push(`${name}: CSP ${m.text()}`));
  await page.goto(new globalThis.URL('registrieren', URL).toString());
  await page.getByLabel('E-Mail').fill(`${name}-${stamp}@example.com`);
  await page.getByLabel('Passwort', { exact: true }).fill('waidmann1');
  await page.getByLabel('Passwort bestätigen').fill('waidmann1');
  await page.getByRole('button', { name: 'Registrieren' }).click();
  await page.getByRole('heading', { level: 1, name: 'Profil' }).waitFor({ timeout: 10000 });
  await page.getByLabel('Anzeigename').fill(name);
  await page.getByLabel('Benutzername').fill(`${name.toLowerCase()}_${stamp}`.slice(0, 24));
  await page.getByRole('button', { name: 'Speichern' }).click();
  await page.getByText(`@${name.toLowerCase()}_`).waitFor({ timeout: 10000 });
  return page;
}

const owner = await newUser('Revierleiter');
await owner.getByRole('link', { name: 'Gruppe', exact: true }).click();
await owner.getByRole('link', { name: 'Gruppe erstellen' }).click();
await owner.getByLabel('Name der Gruppe').fill(`Jagd ${stamp}`);
await owner.getByRole('button', { name: 'Gruppe erstellen' }).click();
await owner.getByRole('heading', { level: 1, name: `Jagd ${stamp}` }).waitFor({ timeout: 10000 });
const groupUrl = owner.url();

await owner.getByRole('link', { name: 'Revier anlegen' }).click();
await owner.getByLabel('Name des Reviers').fill('Fünfzehnhöfe');
await owner.getByRole('button', { name: 'Revier anlegen' }).click();
await owner.getByRole('heading', { level: 1, name: 'Fünfzehnhöfe' }).waitFor({ timeout: 10000 });
check(true, 'Revier angelegt (RLS: Owner legt an)');

const canvas = owner.locator('.maplibregl-canvas');
await canvas.waitFor({ timeout: 20000 });
check(true, 'MapLibre-Karte geladen');

await owner.getByRole('button', { name: 'Grenze zeichnen' }).click();
const box = await canvas.boundingBox();
for (const [fx, fy] of [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]]) {
  await canvas.click({ position: { x: box.width * fx, y: box.height * fy } });
}
check((await owner.locator('strong').filter({ hasText: /^4$/ }).count()) === 1, 'Vier Eckpunkte durch Antippen gesetzt');
await owner.getByRole('button', { name: 'Grenze speichern' }).click();
await owner.getByText('Reviergrenze gespeichert.').waitFor({ timeout: 10000 });
const area1 = await owner.getByText(/ca\. .* ha/).textContent({ timeout: 10000 });
check(/ha$/.test(area1 ?? ''), `Gezeichnete Grenze gespeichert (${area1})`);

await owner.getByTestId('boundary-file').setInputFiles(kmlPath);
await owner.getByText('Reviergrenze aus „revier-test.kml“ übernommen.').waitFor({ timeout: 10000 });
await owner.waitForFunction(() => /ca\. 3\d\d(,\d)? ha/.test(document.body.innerText), null, { timeout: 10000 });
check(true, `KML importiert, Fläche aus normalisiertem MultiPolygon: ${await owner.getByText(/ca\. .* ha/).textContent()}`);

await owner.getByRole('button', { name: 'Einrichtung setzen' }).click();
await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.5 } });
await owner.getByLabel('Art der Einrichtung').selectOption('drueckjagdbock');
await owner.getByLabel('Name').fill('Bock 12');
await owner.getByRole('button', { name: 'Einrichtung speichern' }).click();
await owner.getByText('„Bock 12“ gespeichert.').waitFor({ timeout: 10000 });
check(await visible(owner.getByRole('button', { name: 'Drückjagdbock ohne Dach Bock 12' })), 'Einrichtung gesetzt und als Marker auf der Karte');
if (shot) await owner.screenshot({ path: `${shot}/revier.png` });

await owner.goto(groupUrl);
await owner.getByRole('button', { name: '24 Stunden' }).click();
await owner.getByRole('button', { name: 'Einladungscode erzeugen' }).click();
const code = (await owner.getByLabel('Einladungscode').textContent({ timeout: 10000 }))?.trim();

const member = await newUser('Schuetze', { geolocation: { latitude: 51.169, longitude: 7.247 }, permissions: ['geolocation'] });
await member.goto(new globalThis.URL(`gruppe/beitreten?code=${code}`, URL).toString());
await member.getByRole('button', { name: 'Beitreten' }).click();
await member.getByRole('heading', { level: 1, name: `Jagd ${stamp}` }).waitFor({ timeout: 10000 });
await member.getByRole('link', { name: 'Karte', exact: true }).click();
await member.locator('.maplibregl-canvas').waitFor({ timeout: 20000 });
await member.getByRole('button', { name: 'Drückjagdbock ohne Dach Bock 12' }).waitFor({ timeout: 10000 });
check(true, 'Mitglied sieht Revier und Einrichtung auf der Übersichtskarte (RLS lesen)');
await member.getByRole('button', { name: 'Mein Standort' }).click();
await member.getByLabel('Mein Standort').waitFor({ timeout: 10000 });
check(await visible(member.getByText(/Genauigkeit etwa/)), 'Eigener Standort wird angezeigt (nur lokal)');
await member.getByRole('button', { name: 'Luftbild' }).click();
await member.getByRole('button', { name: 'Drückjagdbock ohne Dach Bock 12' }).click();
await member.getByRole('link', { name: 'Revier Fünfzehnhöfe öffnen' }).click();
await member.getByRole('heading', { level: 1, name: 'Fünfzehnhöfe' }).waitFor({ timeout: 10000 });
await member.locator('.map-view[data-boundaries="1"]').waitFor({ timeout: 10000 });
check(true, 'Reviergrenze liegt in der Karte, auch wenn Kacheln noch laden');
check(
  !(await member.getByRole('button', { name: 'Grenze zeichnen' }).isVisible()) && !(await member.getByRole('button', { name: 'Einrichtung setzen' }).isVisible()),
  'Mitglied hat keine Bearbeiten-Knöpfe',
);
if (shot) await member.screenshot({ path: `${shot}/karte-mitglied.png` });

check(errors.length === 0, `keine Seitenfehler${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
