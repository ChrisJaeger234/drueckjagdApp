// Ende-zu-Ende-Test für den Gruppenchat (Phase 9, Teil 1) gegen einen lokalen Supabase-Stack.
// Zwei Mitglieder schreiben sich, Nachrichten kommen per Realtime ohne Neuladen an, eine im
// Funkloch geschriebene Nachricht wartet und geht genau einmal raus, eigene lassen sich löschen.
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

async function newUser(name) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  contexts[name] = context;
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  if (process.env.DEBUG_CHAT) {
    page.on('response', (r) => r.url().includes('/rest/v1/messages') && console.log(`  ${name} ${r.request().method()} ${r.status()} ${new Date().toISOString().slice(17, 23)}`));
    page.on('requestfailed', (r) => console.log(`  ${name} FAILED ${r.url()} ${r.failure()?.errorText}`));
    page.on('console', (m) => m.type() === 'error' && console.log(`  ${name} console: ${m.text()}`));
  }
  if (process.env.CPU_THROTTLE) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU_THROTTLE) });
  }
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

async function send(page, text) {
  await page.getByRole('textbox', { name: 'Nachricht' }).fill(text);
  await page.getByRole('button', { name: 'Senden' }).click();
}

const anna = await newUser('Anna');
await anna.getByRole('link', { name: 'Gruppe', exact: true }).click();
await anna.getByRole('link', { name: 'Gruppe erstellen' }).click();
await anna.getByLabel('Name der Gruppe').fill(`Chat ${stamp}`);
await anna.getByRole('button', { name: 'Gruppe erstellen' }).click();
await anna.getByRole('heading', { level: 1, name: `Chat ${stamp}` }).waitFor({ timeout: 10000 });
await anna.getByRole('button', { name: 'Einladungscode erzeugen' }).click();
const code = (await anna.getByLabel('Einladungscode').textContent({ timeout: 10000 }))?.trim();

const ben = await newUser('Ben');
await ben.goto(new globalThis.URL(`gruppe/beitreten?code=${code}`, URL).toString());
await ben.getByRole('button', { name: 'Beitreten' }).click();
await ben.getByRole('heading', { level: 1, name: `Chat ${stamp}` }).waitFor({ timeout: 10000 });

for (const page of [anna, ben]) {
  await page.getByRole('link', { name: 'Chat', exact: true }).click();
  await page.getByRole('list', { name: 'Chats' }).getByRole('link', { name: `Chat ${stamp}` }).click();
  await page.getByText(/Noch keine Nachrichten/).waitFor({ timeout: 10000 });
}
check(true, 'Beide öffnen den Gruppenchat');

await send(anna, 'Treffen 7 Uhr am Hof');
check(await visible(anna.getByRole('list', { name: 'Nachrichten' }).getByText('Treffen 7 Uhr am Hof')), 'Anna sendet');
// Realtime: Ben lädt nicht neu (Polling erst nach 30 s).
check(await visible(ben.getByText('Treffen 7 Uhr am Hof'), 8000), 'Ben sieht die Nachricht sofort (Realtime)');
check(await visible(ben.getByRole('list', { name: 'Nachrichten' }).getByText('Anna', { exact: true })), 'mit Absendername');

await send(ben, 'Bin dabei, bringe den Hund mit');
// Großzügige Frist: nach einem Kaltstart braucht Realtime einige Sekunden, bis es Änderungen liefert.
const replied = await visible(anna.getByText('Bin dabei, bringe den Hund mit'), 15000);
check(replied, 'Anna sieht Bens Antwort sofort');
if (!replied) {
  // Diagnose: ist die Nachricht überhaupt angekommen, und was zeigt Ben?
  console.log(`  Ben zeigt: ${(await ben.getByRole('list', { name: 'Nachrichten' }).innerText()).replace(/\n/g, ' | ')}`);
  const later = await visible(anna.getByText('Bin dabei, bringe den Hund mit'), 30000);
  console.log(`  Anna nach weiteren 30 s (Abruf alle 30 s): ${later ? 'angekommen' : 'fehlt'}`);
}

// Funkloch
await contexts.Ben.setOffline(true);
await send(ben, 'Sau liegt am Bach');
check(await visible(ben.getByText('Wartet auf Netz')), 'Ohne Netz: Nachricht wartet');
check(await visible(ben.getByText(/1 Nachricht wartet und wird automatisch gesendet/)), 'Hinweis oben zeigt die wartende Nachricht');
await ben.waitForTimeout(1500);
await contexts.Ben.setOffline(false);
check(await gone(ben.getByText('Wartet auf Netz'), 20000), 'Mit Netz automatisch gesendet');
check(await visible(anna.getByText('Sau liegt am Bach'), 10000), 'Anna bekommt die Nachricht aus dem Funkloch');
await anna.reload();
await anna.getByText('Sau liegt am Bach').waitFor({ timeout: 10000 });
check((await anna.getByText('Sau liegt am Bach').count()) === 1, 'Genau einmal angekommen (Geräte-ID)');
if (shot) await anna.screenshot({ path: `${shot}/chat.png` });

check((await anna.getByRole('button', { name: 'Nachricht löschen' }).count()) === 1, 'Nur eigene Nachrichten sind löschbar');
await anna.getByRole('button', { name: 'Nachricht löschen' }).click();
await anna.getByRole('alertdialog').getByRole('button', { name: 'Löschen' }).click();
check(await gone(anna.getByText('Treffen 7 Uhr am Hof')), 'Anna löscht ihre Nachricht');
check(await gone(ben.getByText('Treffen 7 Uhr am Hof')), 'Gelöscht auch bei Ben (Realtime)');

check(errors.length === 0, `keine Seitenfehler${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
