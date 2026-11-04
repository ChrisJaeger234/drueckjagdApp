// Rauchtest im Chromium ohne Supabase-Konfiguration: Einrichtungshinweis statt Scheinverbindung,
// Service Worker, Offline-Start, installierbares Manifest.
// Aufruf: npm run build && npx vite preview --port 4180 & APP_URL=http://localhost:4180/ npm run e2e
// Playwright wird global erwartet (NODE_PATH=$(npm root -g)), nicht als Projektabhängigkeit.
// Den Ablauf mit echter Datenbank prüft e2e/auth-local.mjs.
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const URL = process.env.APP_URL ?? 'http://localhost:4180/';

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
check(await page.getByRole('heading', { level: 1, name: 'Einrichtung nötig' }).isVisible(), 'Ohne Konfiguration: Einrichtungshinweis');
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'Service Worker kontrolliert die Seite');

await context.setOffline(true);
await page.goto(new globalThis.URL('karte', URL).toString());
check(await page.getByRole('heading', { level: 1, name: 'Einrichtung nötig' }).isVisible(), 'Unterseite startet ohne Netz');
await context.setOffline(false);

const manifest = await page.evaluate(async () => {
  const href = document.querySelector('link[rel=manifest]')?.getAttribute('href');
  return href ? (await fetch(href)).json() : null;
});
check(manifest?.display === 'standalone' && manifest?.icons?.length >= 2, 'Manifest installierbar (standalone, Icons)');
check(errors.length === 0, `keine Seitenfehler${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
