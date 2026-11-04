// Rauchtest im Chromium: App lädt, Service Worker aktiv, kleines Offline-Paket,
// Neustart ohne Netz, GPS mit simulierter Position, Testmeldung bleibt erhalten.
// Aufruf: npm run build && npx vite preview --port 4173 & npm run e2e
// Playwright ist in der Testumgebung global installiert (NODE_PATH), nicht im Projekt.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const URL = process.env.APP_URL ?? 'http://localhost:4173/';
const shot = process.env.SHOT_DIR;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  geolocation: { latitude: 51.1687, longitude: 7.2475, accuracy: 8 },
  permissions: ['geolocation', 'notifications'],
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const check = (ok, msg) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
  if (!ok) process.exitCode = 1;
};

await page.goto(URL);
await page.waitForFunction(() => navigator.serviceWorker?.controller != null || navigator.serviceWorker?.ready, null, { timeout: 15000 });
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'Service Worker kontrolliert die Seite');

// Kleines Paket: nur Karte bis Zoom 16, damit der Test schnell bleibt.
await page.uncheck('#pack-luftbild');
await page.selectOption('#pack-zoom', '16');
await page.click('#pack-load');
await page.waitForFunction(() => document.getElementById('pack-progress')?.textContent?.startsWith('Fertig'), null, { timeout: 120000 });
console.log('     ', await page.textContent('#pack-progress'));

await page.click('#gps-toggle');
await page.waitForFunction(() => /±\d+ m/.test(document.getElementById('gps-status')?.textContent ?? ''), null, { timeout: 15000 });
check(true, `GPS: ${await page.textContent('#gps-status')}`);

console.log('      Meldungen vor dem Offline-Schalten:', errors.length ? errors.join(' | ') : 'keine');
errors.length = 0;
await context.setOffline(true);
await page.click('#report-add');
await page.reload();
check((await page.textContent('h1')) === 'Drückjagd PWA-Test', 'App startet ohne Netz');
await page.waitForFunction(() => /gespeichert/.test(document.getElementById('report-status')?.textContent ?? ''), null, { timeout: 5000 });
check(true, `Meldung ohne Netz: ${await page.textContent('#report-status')}`);

// Karte ohne Netz: Kacheln kommen aus dem Paket.
await page.waitForTimeout(3000);
const tileErrors = errors.filter((e) => /Kachel|Failed to fetch|NetworkError/.test(e));
check(tileErrors.length === 0, `Kartenkacheln ohne Netz geladen (${tileErrors.length} Fehler)`);
await page.evaluate(() => window.scrollTo(0, 0));
if (shot) await page.screenshot({ path: `${shot}/offline.png`, fullPage: false });

await page.click('#report-build');
await page.waitForFunction(() => document.getElementById('report-text').value.length > 0);
console.log((await page.inputValue('#report-text')).split('\n').slice(0, 11).join('\n'));
check(errors.length === 0, `keine Seitenfehler${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
