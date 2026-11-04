// Ende-zu-Ende-Test für Live-Standorte (Phase 8) gegen einen lokalen Supabase-Stack.
// Jagdleiter startet die Jagd, Treiber teilt seinen (simulierten) GPS-Standort, die Jagdleitung
// sieht ihn, der Schütze nicht. Nach dem Ende der Jagd endet das Teilen von selbst.
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
const visible = (locator, timeout = 10000) => locator.waitFor({ timeout }).then(() => true, () => false);
const gone = (locator, timeout = 10000) => locator.waitFor({ state: 'hidden', timeout }).then(() => true, () => false);

const stamp = Date.now().toString(36);
const browser = await chromium.launch();
const errors = [];
const contexts = {};

async function newUser(name, geo) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ...(geo ? { geolocation: geo, permissions: ['geolocation'] } : {}),
  });
  contexts[name] = context;
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
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

async function join(page, code, role) {
  await page.goto(new globalThis.URL(`gruppe/beitreten?code=${code}`, URL).toString());
  await page.getByRole('button', { name: 'Beitreten' }).click();
  await page.getByRole('link', { name: /Live-Jagd/ }).click();
  await page.getByRole('heading', { level: 1, name: 'Live-Jagd' }).waitFor({ timeout: 10000 });
  await page.getByLabel('Meine Rolle').selectOption(role);
  await page.getByRole('button', { name: 'Eintragen' }).click();
  await page.getByText('Du bist dabei als').waitFor({ timeout: 10000 });
}

const lead = await newUser('Jagdleiterin');
await lead.getByRole('link', { name: 'Gruppe', exact: true }).click();
await lead.getByRole('link', { name: 'Gruppe erstellen' }).click();
await lead.getByLabel('Name der Gruppe').fill(`Live ${stamp}`);
await lead.getByRole('button', { name: 'Gruppe erstellen' }).click();
await lead.getByRole('heading', { level: 1, name: `Live ${stamp}` }).waitFor({ timeout: 10000 });
const groupUrl = lead.url();
await lead.getByRole('link', { name: 'Jagd planen' }).click();
await lead.getByLabel('Titel').fill('Live-Jagd');
await lead.getByRole('button', { name: 'Jagd anlegen' }).click();
await lead.getByRole('heading', { level: 1, name: 'Live-Jagd' }).waitFor({ timeout: 10000 });
const huntUrl = lead.url();
await lead.goto(groupUrl);
await lead.getByRole('button', { name: 'Einladungscode erzeugen' }).click();
const code = (await lead.getByLabel('Einladungscode').textContent({ timeout: 10000 }))?.trim();

const driver = await newUser('Tobias', { latitude: 51.17, longitude: 7.25, accuracy: 10 });
await join(driver, code, 'treiber');
check(await visible(driver.getByText(/Sobald die Jagd läuft, kannst du als Treiber/)), 'Vor Beginn: Hinweis aufs Teilen');

const shooter = await newUser('Schuetze', { latitude: 51.16, longitude: 7.24, accuracy: 10 });
await join(shooter, code, 'schuetze');

await lead.goto(huntUrl);
await lead.getByRole('button', { name: 'Jagd starten' }).click();
await lead.getByRole('button', { name: 'Jagd beenden' }).waitFor({ timeout: 10000 });
check(true, 'Jagd gestartet');

await driver.reload();
await driver.getByRole('button', { name: 'Meinen Standort teilen' }).click();
check(await visible(driver.getByText('Dein Standort wird geteilt: Live-Jagd')), 'Treiber teilt seinen Standort (Hinweis oben)');
check(await visible(driver.getByTestId('live-status').filter({ hasText: /Zuletzt gesendet/ }), 15000), 'Standort an die Datenbank gesendet (RPC share_hunt_position)');
await driver.getByRole('link', { name: 'Übersicht' }).click();
check(await visible(driver.getByText('Dein Standort wird geteilt: Live-Jagd')), 'Teilen läuft beim Seitenwechsel weiter');

await lead.reload();
const list = lead.getByRole('list', { name: 'Live-Standorte' });
check(await visible(list.getByText('Tobias', { exact: true }), 15000), 'Jagdleitung sieht den Treiber in der Liste');
check(await visible(lead.locator('[aria-label^="Treiber Tobias"]'), 15000), 'und als Marker auf der Karte');
if (shot) await lead.screenshot({ path: `${shot}/live-leitung.png`, fullPage: true });

await shooter.reload();
check(await visible(shooter.getByText(/Als Schütze teilst du keinen Standort/)), 'Schütze teilt nicht');
check((await shooter.getByRole('list', { name: 'Live-Standorte' }).count()) === 0, 'Schütze sieht keine Live-Standorte (RLS)');
check((await shooter.locator('[aria-label^="Treiber Tobias"]').count()) === 0, 'Schütze sieht keinen Treiber-Marker');

await lead.getByRole('button', { name: 'Jagd beenden' }).click();
await lead.getByRole('button', { name: 'Wieder öffnen' }).waitFor({ timeout: 10000 });
check((await lead.getByRole('list', { name: 'Live-Standorte' }).count()) === 0, 'Nach dem Ende keine Live-Standorte mehr');

// Nächster Standort des Treibers wird abgelehnt, das Teilen endet von selbst.
await driver.waitForTimeout(11000);
await contexts.Tobias.setGeolocation({ latitude: 51.172, longitude: 7.252, accuracy: 10 });
check(await gone(driver.getByText('Dein Standort wird geteilt: Live-Jagd'), 20000), 'Teilen endet automatisch, wenn die Jagd vorbei ist');

check(errors.length === 0, `keine Seitenfehler${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
