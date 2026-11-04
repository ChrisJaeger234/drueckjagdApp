// Ende-zu-Ende-Test gegen einen lokalen Supabase-Stack mit allen Migrationen aus ../supabase.
// Voraussetzung: `supabase start` im Repository, App gebaut mit dessen URL und Publishable-Key:
//   VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_… \
//     npx vite build --outDir /tmp/wa-local && npx vite preview --outDir /tmp/wa-local --port 4181 &
//   NODE_PATH=$(npm root -g) APP_URL=http://localhost:4181/ node e2e/auth-local.mjs
// Legt ein neues Testkonto in der LOKALEN Datenbank an; niemals gegen Produktion ausführen.
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

const email = `test-${Date.now()}@example.com`;
const password = 'waidmann1';
const user = `jaeger_${Date.now().toString(36)}`.slice(0, 24);

// Kleines PNG als Profilbild (1x1 Pixel, grün).
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const pngPath = join(tmpdir(), 'avatar-test.png');
writeFileSync(pngPath, png);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(URL);
check(await page.getByRole('heading', { level: 1, name: 'Anmelden' }).isVisible({ timeout: 10000 }).catch(() => false), 'Abgemeldet: Anmeldeseite');

await page.getByRole('link', { name: 'Neues Konto erstellen' }).click();
await page.getByLabel('E-Mail').fill(email);
await page.getByLabel('Passwort', { exact: true }).fill(password);
await page.getByLabel('Passwort bestätigen').fill(password);
await page.getByRole('button', { name: 'Registrieren' }).click();
await page.getByRole('heading', { level: 1, name: 'Profil' }).waitFor({ timeout: 10000 });
check(true, `Registriert und angemeldet als ${email}`);
check(await page.getByText('Profil vervollständigen').waitFor({ timeout: 10000 }).then(() => true, () => false), 'Neues Profil ist unvollständig (Trigger handle_new_user hat es angelegt)');

await page.getByLabel('Anzeigename').fill('Max Testjäger');
await page.getByLabel('Benutzername').fill(user);
await page.getByRole('button', { name: 'Speichern' }).click();
await page.getByText(`@${user}`).waitFor({ timeout: 10000 });
check(true, 'Profil gespeichert (RLS: nur eigenes Profil bearbeiten)');

await page.locator('input[type=file]').setInputFiles(pngPath);
await page.locator('img[src*="/storage/v1/object/sign/avatars/"]').waitFor({ timeout: 15000 });
check(true, 'Profilbild hochgeladen und über signierte URL angezeigt (Bucket avatars, eigener Ordner)');
if (shot) await page.screenshot({ path: `${shot}/profil.png` });

await context.setOffline(true);
await page.reload();
check(await page.getByRole('navigation', { name: 'Hauptnavigation' }).isVisible({ timeout: 10000 }).catch(() => false), 'Ohne Netz neu geladen: weiterhin angemeldet');
await context.setOffline(false);

await page.getByRole('link', { name: 'Profil' }).click();
await page.getByRole('button', { name: 'Abmelden' }).click();
await page.getByRole('heading', { level: 1, name: 'Anmelden' }).waitFor({ timeout: 10000 });
check(true, 'Abgemeldet');

await page.getByLabel('E-Mail').fill(email);
await page.getByLabel('Passwort', { exact: true }).fill('falsch123');
await page.getByRole('button', { name: 'Anmelden' }).click();
check((await page.getByRole('alert').textContent({ timeout: 10000 }))?.includes('falsch') === true, 'Falsches Passwort wird abgelehnt');

await page.getByLabel('Passwort', { exact: true }).fill(password);
await page.getByRole('button', { name: 'Anmelden' }).click();
await page.getByRole('heading', { level: 1, name: 'Übersicht' }).waitFor({ timeout: 10000 });
check(await page.getByText('Waidmannsheil, Max Testjäger!').isVisible({ timeout: 10000 }), 'Wieder angemeldet, Übersicht begrüßt mit Profilnamen');

check(errors.length === 0, `keine Seitenfehler${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
