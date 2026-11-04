// Ende-zu-Ende-Test für den Offline-Betrieb gegen einen lokalen Supabase-Stack (Aufbau wie auth-local.mjs).
// Jagd online öffnen, ohne Netz neu starten (Daten aus IndexedDB), Meldung ohne Netz abgeben,
// nochmals ohne Netz neu starten (Warteschlange bleibt), Netz zurück: Meldung kommt genau einmal an.
// Beim Abmelden wird der Offline-Speicher gelöscht.
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

const stamp = Date.now().toString(36);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

/** Inhalt des Offline-Speichers (idb-keyval: Datenbank keyval-store). */
const storedCache = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('keyval-store');
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('keyval')) return resolve(null);
          const get = db.transaction('keyval').objectStore('keyval').get('drueckjagd-query-cache');
          get.onsuccess = () => resolve(get.result ?? null);
          get.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      }),
  );

await page.goto(new globalThis.URL('registrieren', URL).toString());
await page.evaluate(() => navigator.serviceWorker.ready);
await page.getByLabel('E-Mail').fill(`offline-${stamp}@example.com`);
await page.getByLabel('Passwort', { exact: true }).fill('waidmann1');
await page.getByLabel('Passwort bestätigen').fill('waidmann1');
await page.getByRole('button', { name: 'Registrieren' }).click();
await page.getByRole('heading', { level: 1, name: 'Profil' }).waitFor({ timeout: 10000 });
await page.getByLabel('Anzeigename').fill('Funkloch');
await page.getByLabel('Benutzername').fill(`funkloch_${stamp}`.slice(0, 24));
await page.getByRole('button', { name: 'Speichern' }).click();
await page.getByText('@funkloch_').waitFor({ timeout: 10000 });

await page.getByRole('link', { name: 'Gruppe', exact: true }).click();
await page.getByRole('link', { name: 'Gruppe erstellen' }).click();
await page.getByLabel('Name der Gruppe').fill(`Funkloch ${stamp}`);
await page.getByRole('button', { name: 'Gruppe erstellen' }).click();
await page.getByRole('link', { name: 'Jagd planen' }).click();
await page.getByLabel('Titel').fill('Drückjagd im Funkloch');
await page.getByLabel('Notfall').fill('Rettungspunkt FL-7');
await page.getByRole('button', { name: 'Jagd anlegen' }).click();
await page.getByRole('heading', { level: 1, name: 'Drückjagd im Funkloch' }).waitFor({ timeout: 10000 });
await page.getByRole('button', { name: 'Jagd starten' }).click();
await page.getByRole('button', { name: 'Jagd beenden' }).waitFor({ timeout: 10000 });
await page.waitForTimeout(1500); // Speichern ist auf 1 s gedrosselt.
check(typeof (await storedCache()) === 'string', 'Geladene Daten liegen in IndexedDB');

await context.setOffline(true);
await page.reload();
check(await visible(page.getByRole('heading', { level: 1, name: 'Drückjagd im Funkloch' }), 15000), 'Ohne Netz neu gestartet: Jagd aus dem Gerätespeicher');
check(await visible(page.getByText('Rettungspunkt FL-7')), 'Notfallinfo auch offline sichtbar');
check(await visible(page.getByText(/Kein Netz\. Die App läuft offline/)), 'Hinweis „Kein Netz“');

await page.getByRole('button', { name: 'Anblick' }).click();
await page.getByRole('button', { name: 'Schwarzwild' }).click();
await page.getByLabel('Anzahl').fill('5');
await page.getByRole('button', { name: 'Anblick melden' }).click();
check(await visible(page.getByText(/Kein Netz: Meldung „Anblick“ ist gespeichert/)), 'Meldung ohne Netz angenommen');
check(await visible(page.getByRole('list', { name: 'Meldungen' }).getByText('Wartet auf Netz')), 'Meldung als „wartet auf Netz“ markiert');
check(await visible(page.getByText('Kein Netz. 1 Meldung wartet und wird automatisch gesendet.')), 'Hinweis zeigt die Warteschlange');

await page.waitForTimeout(1500);
await page.reload();
check(await visible(page.getByText('Kein Netz. 1 Meldung wartet und wird automatisch gesendet.'), 15000), 'Warteschlange übersteht einen Neustart ohne Netz');
if (shot) await page.screenshot({ path: `${shot}/offline-warteschlange.png` });

await context.setOffline(false);
const reports = page.getByRole('list', { name: 'Meldungen' });
await reports.getByText('Wartet auf Netz').waitFor({ state: 'detached', timeout: 20000 });
check(await visible(reports.getByText('Anblick: 5 × Schwarzwild')), 'Mit Netz automatisch gesendet');
await page.reload();
await reports.waitFor({ timeout: 10000 });
check((await reports.getByText('Anblick: 5 × Schwarzwild').count()) === 1, 'Nach Neuladen genau eine Meldung in der Datenbank');

await page.getByRole('link', { name: 'Profil' }).click();
await page.getByRole('button', { name: 'Abmelden' }).click();
await page.getByRole('heading', { level: 1, name: 'Anmelden' }).waitFor({ timeout: 10000 });
await page.waitForTimeout(500);
check((await storedCache()) === null, 'Beim Abmelden wird der Offline-Speicher gelöscht');

check(errors.length === 0, `keine Seitenfehler${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
