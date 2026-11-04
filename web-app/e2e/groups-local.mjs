// Ende-zu-Ende-Test der Gruppen gegen einen lokalen Supabase-Stack (Aufbau wie e2e/auth-local.mjs).
// Zwei Konten: Owner erstellt Gruppe und Einladung, zweites Konto tritt über den Link bei,
// Owner ernennt es zum Admin, Mitglied verlässt die Gruppe.
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

const stamp = Date.now().toString(36);
const browser = await chromium.launch();
const errors = [];

async function newUser(name) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
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

const owner = await newUser('Jagdleiter');
await owner.getByRole('link', { name: 'Gruppe', exact: true }).click();
await owner.getByText('Noch in keiner Gruppe').waitFor({ timeout: 10000 });
await owner.getByRole('link', { name: 'Gruppe erstellen' }).click();
await owner.getByLabel('Name der Gruppe').fill(`Hegering ${stamp}`);
await owner.getByRole('button', { name: 'Gruppe erstellen' }).click();
await owner.getByRole('heading', { level: 1, name: `Hegering ${stamp}` }).waitFor({ timeout: 10000 });
check(await owner.getByText('Deine Rolle:').locator('..').getByText('Owner').isVisible(), 'Gruppe erstellt (RPC create_group), Ersteller ist Owner');

await owner.getByRole('button', { name: '5×' }).click();
await owner.getByRole('button', { name: 'Einladungscode erzeugen' }).click();
const code = (await owner.getByLabel('Einladungscode').textContent({ timeout: 10000 }))?.trim() ?? '';
check(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code), `Einladungscode erzeugt: ${code}`);
await owner.getByRole('list', { name: 'Bisherige Einladungen' }).getByText('0 / 5 genutzt').waitFor({ timeout: 10000 });
check(true, 'Einladung erscheint in der Liste (0 / 5 genutzt)');
await owner.getByRole('button', { name: 'Link kopieren' }).click();
const link = await owner.evaluate(() => navigator.clipboard.readText());
check(link.includes('/gruppe/beitreten?code='), `Einladungslink: ${link}`);
if (shot) await owner.screenshot({ path: `${shot}/gruppe-owner.png`, fullPage: true });

const member = await newUser('Treiber');
await member.goto(link);
check((await member.getByLabel('Einladungscode').inputValue({ timeout: 10000 })) === code, 'Link füllt den Code vor');
await member.getByRole('button', { name: 'Beitreten' }).click();
await member.getByRole('heading', { level: 1, name: `Hegering ${stamp}` }).waitFor({ timeout: 10000 });
check(await member.getByText('Deine Rolle:').locator('..').getByText('Mitglied').isVisible(), 'Beigetreten (RPC redeem_group_invite) als Mitglied');
check(await member.getByText('Mitglieder (2)').isVisible(), 'Mitglied sieht beide Mitglieder (RLS group_members)');
check(!(await member.getByRole('button', { name: 'Einladungscode erzeugen' }).isVisible()), 'Mitglied sieht keine Einladungsverwaltung');

await owner.reload();
await owner.getByText('Mitglieder (2)').waitFor({ timeout: 10000 });
check(await owner.getByText('1 / 5 genutzt').isVisible(), 'Nutzung der Einladung gezählt');
await owner.getByLabel('Rolle von Treiber').selectOption('admin');
await owner.waitForResponse((r) => r.url().includes('set_group_member_role') && r.ok(), { timeout: 10000 });
await member.reload();
await member.getByText('Deine Rolle:').locator('..').getByText('Admin').waitFor({ timeout: 10000 });
check(true, 'Owner ernennt Mitglied zum Admin (RPC set_group_member_role)');
check(await member.getByRole('button', { name: 'Einladungscode erzeugen' }).isVisible(), 'Admin darf einladen (admins_can_manage_members)');

await owner.getByRole('button', { name: 'Gruppe verlassen' }).click();
await owner.getByRole('button', { name: 'Ja, verlassen' }).click();
check(
  (await owner.getByRole('alert').textContent({ timeout: 10000 }))?.includes('einzige Owner') === true,
  'Einziger Owner kann nicht austreten (last_owner)',
);

await member.getByRole('button', { name: 'Gruppe verlassen' }).click();
await member.getByRole('button', { name: 'Ja, verlassen' }).click();
await member.getByText('Noch in keiner Gruppe').waitFor({ timeout: 10000 });
check(true, 'Admin verlässt die Gruppe (RPC leave_group)');

await member.goto(link);
await member.getByRole('button', { name: 'Beitreten' }).click();
await member.getByRole('heading', { level: 1, name: `Hegering ${stamp}` }).waitFor({ timeout: 10000 });
check(true, 'Mehrfach nutzbarer Code funktioniert erneut');

await owner.reload();
await owner.getByRole('button', { name: 'Entfernen' }).click();
await owner.getByRole('button', { name: 'Ja, entfernen' }).click();
await owner.getByText('Mitglieder (1)').waitFor({ timeout: 10000 });
check(true, 'Owner entfernt Mitglied (RPC remove_group_member)');

await owner.getByRole('list', { name: 'Bisherige Einladungen' }).getByRole('button', { name: 'Widerrufen' }).click();
await owner.getByRole('list', { name: 'Bisherige Einladungen' }).getByText('Widerrufen').waitFor({ timeout: 10000 });
await member.goto(link);
await member.getByRole('button', { name: 'Beitreten' }).click();
check((await member.getByRole('alert').textContent({ timeout: 10000 }))?.includes('ungültig') === true, 'Widerrufener Code wird abgelehnt');

await owner.getByRole('button', { name: 'Gruppe löschen' }).click();
await owner.getByRole('button', { name: 'Endgültig löschen' }).click();
await owner.getByText('Noch in keiner Gruppe').waitFor({ timeout: 10000 });
check(true, 'Owner löscht die Gruppe');

check(errors.length === 0, `keine Seitenfehler${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
