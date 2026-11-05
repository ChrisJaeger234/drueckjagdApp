// Ende-zu-Ende-Test für Jagden gegen einen lokalen Supabase-Stack (Aufbau wie e2e/auth-local.mjs).
// Owner plant eine Jagd (Trigger: Ersteller wird Jagdleiter), Mitglied trägt sich als Schütze ein,
// Jagdleitung setzt einen Stand auf der Karte und teilt ihn zu, zeichnet ein Treiben, Schütze meldet
// „angeschossen“, Jagdleitung erledigt die Nachsuche, startet und beendet die Jagd.
// Legt Testkonten in der LOKALEN Datenbank an; niemals gegen Produktion ausführen.
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const URL = process.env.APP_URL ?? 'http://localhost:4181/';
const shot = process.env.SHOT_DIR;
if (!/localhost|127\.0\.0\.1/.test(URL)) throw new Error('Dieser Test läuft nur gegen eine lokale App.');

const check = (ok, msg) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
  if (!ok) process.exitCode = 1;
};
const visible = (locator) => locator.waitFor({ timeout: 10000 }).then(() => true, () => false);

const stamp = Date.now().toString(36);
const browser = await chromium.launch();
const errors = [];

async function newUser(name) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
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

const lead = await newUser('Jagdherr');
await lead.getByRole('link', { name: 'Gruppe', exact: true }).click();
await lead.getByRole('link', { name: 'Gruppe erstellen' }).click();
await lead.getByLabel('Name der Gruppe').fill(`Drückjagd ${stamp}`);
await lead.getByRole('button', { name: 'Gruppe erstellen' }).click();
await lead.getByRole('heading', { level: 1, name: `Drückjagd ${stamp}` }).waitFor({ timeout: 10000 });
const groupUrl = lead.url();
await lead.getByRole('link', { name: 'Revier anlegen' }).click();
await lead.getByLabel('Name des Reviers').fill('Eichenhang');
await lead.getByRole('button', { name: 'Revier anlegen' }).click();
await lead.getByRole('heading', { level: 1, name: 'Eichenhang' }).waitFor({ timeout: 10000 });

await lead.goto(groupUrl);
await lead.getByRole('link', { name: 'Jagd planen' }).click();
await lead.getByLabel('Titel').fill('Drückjagd Eichenhang');
await lead.getByLabel('Revier').selectOption({ label: 'Eichenhang' });
await lead.getByLabel('Freigabe').fill('Schwarzwild ohne Leitbachen, Fuchs');
await lead.getByLabel('Sicherheitshinweise').fill('Kein Schuss ins Treiben');
await lead.getByLabel('Notfall').fill('Rettungspunkt WR-123');
await lead.getByRole('button', { name: 'Jagd anlegen' }).click();
await lead.getByRole('heading', { level: 1, name: 'Drückjagd Eichenhang' }).waitFor({ timeout: 10000 });
const huntUrl = lead.url();
check(await visible(lead.getByText('Du bist dabei als')), 'Jagd angelegt, Ersteller automatisch eingetragen (Trigger add_hunt_creator)');
check(await visible(lead.getByRole('list', { name: 'Teilnehmer' }).getByLabel('Jagdrolle von Jagdherr')).then(async (v) => v && (await lead.getByLabel('Jagdrolle von Jagdherr').inputValue()) === 'jagdleiter'), 'Ersteller ist Jagdleiter');

await lead.goto(groupUrl);
await lead.getByRole('button', { name: 'Einladungscode erzeugen' }).click();
const code = (await lead.getByLabel('Einladungscode').textContent({ timeout: 10000 }))?.trim();

const shooter = await newUser('Schuetze');
await shooter.goto(new globalThis.URL(`gruppe/beitreten?code=${code}`, URL).toString());
await shooter.getByRole('button', { name: 'Beitreten' }).click();
await shooter.getByRole('link', { name: /Drückjagd Eichenhang/ }).click();
await shooter.getByRole('heading', { level: 1, name: 'Drückjagd Eichenhang' }).waitFor({ timeout: 10000 });
check(await visible(shooter.getByText('Rettungspunkt WR-123')), 'Mitglied sieht Jagd mit Notfallinfo (RLS hunts lesen)');
check(!(await shooter.getByLabel('Meine Rolle').locator('option[value="jagdleiter"]').count()), 'Leitungsrollen sind nicht selbst wählbar');
await shooter.getByRole('button', { name: 'Eintragen' }).click();
check(await visible(shooter.getByText('Noch kein Stand zugeteilt.')), 'Selbst als Schütze eingetragen (RLS + Trigger guard_hunt_participant)');
check(!(await shooter.getByRole('button', { name: 'Stand setzen' }).isVisible()), 'Schütze hat keine Leitungsknöpfe');

await lead.goto(huntUrl);
const canvas = lead.locator('.maplibregl-canvas');
await canvas.waitFor({ timeout: 20000 });
const box = await canvas.boundingBox();
await lead.getByRole('button', { name: 'Stand setzen' }).click();
await canvas.click({ position: { x: box.width * 0.4, y: box.height * 0.4 } });
await lead.getByRole('button', { name: 'Stand speichern' }).click();
await lead.getByText('Stand 1 gesetzt.').waitFor({ timeout: 10000 });
await lead.getByLabel('Schütze für Stand 1').selectOption({ label: 'Schuetze (Schütze)' });
check(await visible(lead.getByRole('button', { name: 'Stand Stand 1' }).filter({ hasText: 'Schuetze' })), 'Stand gesetzt und Schütze zugeteilt, Marker zeigt den Namen');

await lead.getByRole('button', { name: 'Zone zeichnen' }).click();
for (const [fx, fy] of [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]]) await canvas.click({ position: { x: box.width * fx, y: box.height * fy } });
await lead.getByLabel('Name der Zone').fill('Treiben 1');
await lead.getByRole('button', { name: 'Zone speichern' }).click();
check(await visible(lead.getByText('Treiben „Treiben 1“ gespeichert.')), 'Treiben gezeichnet (Trigger normalisiert die Fläche)');

// Karten-Import (KML wie aus Google My Maps): Fläche wird Zone mit Farbe, Punkte werden Stände.
const kmlText = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<Style id="rot"><PolyStyle><color>4d5252ff</color></PolyStyle></Style>
<Placemark><name>TW2 - Runde 1</name><styleUrl>#rot</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>7.2484844,51.1749709,0 7.2451885,51.1702711,0 7.2466304,51.1698908,0 7.2503498,51.1747198,0 7.2484844,51.1749709,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
<Placemark><name>Stand 1</name><Point><coordinates>7.25,51.17,0</coordinates></Point></Placemark>
<Placemark><name>DJB #10</name><Point><coordinates>7.2446752,51.1597495,0</coordinates></Point></Placemark>
</Document></kml>`;
await lead.getByTestId('hunt-import-file').setInputFiles({ name: 'Treiben.kml', mimeType: 'application/vnd.google-earth.kml+xml', buffer: Buffer.from(kmlText) });
check(await visible(lead.getByRole('list', { name: 'Stände aus der Datei' }).getByText('gibt es schon')), 'Import-Vorschau erkennt vorhandenen Stand');
if (shot) await lead.screenshot({ path: `${shot}/jagd-import.png`, fullPage: true });
await lead.getByRole('button', { name: '1 Zone und 1 Stand übernehmen' }).click();
check(await visible(lead.getByText('1 Zone und 1 Stand übernommen.')), 'Karte importiert (Zone und Stand in der Datenbank)');
check(await visible(lead.getByRole('list', { name: 'Zonen' }).getByText('TW2 - Runde 1')), 'Importierte Zone erscheint');
check(await visible(lead.getByRole('list', { name: 'Stände' }).getByText('DJB #10')), 'Importierter Stand erscheint');
check(
  (await lead.getByRole('list', { name: 'Zonen' }).locator('li', { hasText: 'TW2 - Runde 1' }).locator('span').first().evaluate((el) => getComputedStyle(el).backgroundColor)) === 'rgb(255, 82, 82)',
  'Farbe aus der KML übernommen',
);
await lead.getByRole('button', { name: 'Jagd starten' }).click();
check(await visible(lead.getByRole('button', { name: 'Jagd beenden' })), 'Jagd gestartet');

await shooter.reload();
check(await visible(shooter.getByText('Dein Stand: Stand 1')), 'Schütze sieht seinen Stand');
await shooter.getByRole('button', { name: 'Angeschossen' }).click();
await shooter.getByRole('button', { name: 'Schwarzwild' }).click();
await shooter.getByLabel('Notiz (optional)').fill('Schweiß am Anschuss, flüchtig Richtung Bach');
await shooter.getByRole('button', { name: 'Angeschossen melden' }).click();
check(await visible(shooter.getByText('1 offene Nachsuche')), 'Meldung gesendet, offene Nachsuche angezeigt');
if (shot) await shooter.screenshot({ path: `${shot}/jagd-schuetze.png` });

await lead.reload();
const reports = lead.getByRole('list', { name: 'Meldungen' });
check(await visible(reports.getByText('Angeschossen: Schwarzwild')), 'Jagdleitung sieht die Meldung');
check(await visible(reports.getByText(/Stand 1 · Schuetze/)), 'Meldung mit Stand und Melder');
await reports.getByRole('button', { name: 'Erledigt' }).click();
check(await visible(reports.getByText('Nachsuche erledigt')), 'Nachsuche als erledigt markiert (resolved_by per Trigger)');
await lead.getByRole('button', { name: 'Jagd beenden' }).click();
check(await visible(lead.getByRole('button', { name: 'Wieder öffnen' })), 'Jagd beendet');
if (shot) await lead.screenshot({ path: `${shot}/jagd-leitung.png`, fullPage: true });

check(errors.length === 0, `keine Seitenfehler${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
