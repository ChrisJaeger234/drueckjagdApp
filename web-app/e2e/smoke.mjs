// Rauchtest im Chromium: Start, Navigation, Service Worker, Offline-Neustart auf einer Unterseite.
// Aufruf: npm run build && npx vite preview --port 4180 & APP_URL=http://localhost:4180/ npm run e2e
// Playwright wird global erwartet (NODE_PATH=$(npm root -g)), nicht als Projektabhängigkeit.
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const URL = process.env.APP_URL ?? 'http://localhost:4180/';
const shot = process.env.SHOT_DIR;

const check = (ok, msg) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
  if (!ok) process.exitCode = 1;
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(URL);
check(await page.getByRole('heading', { level: 1, name: 'Übersicht' }).isVisible(), 'Übersicht wird angezeigt');
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'Service Worker kontrolliert die Seite');
if (shot) await page.screenshot({ path: `${shot}/mobile.png` });

await page.getByRole('link', { name: 'Karte' }).click();
check(await page.getByRole('heading', { level: 1, name: 'Karte' }).isVisible(), 'Navigation zur Karte');
check(new globalThis.URL(page.url()).pathname.endsWith('/karte'), `Adresse ist ${page.url()}`);

await context.setOffline(true);
await page.reload();
check(await page.getByRole('heading', { level: 1, name: 'Karte' }).isVisible(), 'Unterseite startet ohne Netz');
check(await page.getByText('Kein Netz. Die App läuft offline weiter.').isVisible(), 'Offline-Hinweis sichtbar');
await context.setOffline(false);

await page.setViewportSize({ width: 1280, height: 800 });
await page.getByRole('link', { name: 'Übersicht' }).click();
if (shot) await page.screenshot({ path: `${shot}/desktop.png` });

const manifest = await page.evaluate(async () => {
  const href = document.querySelector('link[rel=manifest]')?.getAttribute('href');
  return href ? (await fetch(href)).json() : null;
});
check(manifest?.display === 'standalone' && manifest?.icons?.length >= 2, 'Manifest installierbar (standalone, Icons)');
check(errors.length === 0, `keine Seitenfehler${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
