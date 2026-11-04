// Ende-zu-Ende-Test für Web-Push (Phase 9, Teil 2) gegen einen lokalen Supabase-Stack mit der
// Edge Function „notify“ (supabase functions serve --env-file supabase/functions/test.env).
//
// Die Funktion verschickt im Test nichts an echte Push-Dienste: mit PUSH_TEST_SINK_URL schickt sie
// die fertig verschlüsselte Anfrage an einen kleinen Server in diesem Skript. Geprüft wird, wer
// benachrichtigt wird und wer nicht. Legt Testkonten in der LOKALEN Datenbank an; niemals gegen
// Produktion ausführen.
import { createRequire } from 'node:module';
import { createECDH, randomBytes } from 'node:crypto';
import http from 'node:http';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const SINK_PORT = Number(process.env.SINK_PORT ?? 54399);
const FUNCTIONS_URL = process.env.FUNCTIONS_URL ?? `${SUPABASE_URL}/functions/v1`;
if (!/localhost|127\.0\.0\.1/.test(SUPABASE_URL)) throw new Error('Dieser Test läuft nur gegen ein lokales Supabase.');

const check = (ok, msg) => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
  if (!ok) process.exitCode = 1;
};

// --- Empfangsserver anstelle der Push-Dienste --------------------------------
let received = [];
const sink = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    try {
      received.push(JSON.parse(body));
    } catch {
      received.push({ invalid: body });
    }
    res.end('ok');
  });
});
await new Promise((r) => sink.listen(SINK_PORT, '0.0.0.0', r));

const stamp = Date.now().toString(36);
const b64url = (buf) => Buffer.from(buf).toString('base64url');

async function newUser(name) {
  const client = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({ email: `${name}-${stamp}@example.com`, password: 'waidmann1' });
  if (error) throw error;
  await client.from('profiles').update({ display_name: name }).eq('id', data.user.id);
  return { client, id: data.user.id, name };
}

async function subscribe(user, host = 'fcm.googleapis.com') {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const endpoint = `https://${host}/fcm/send/${user.name}-${stamp}-${randomBytes(4).toString('hex')}`;
  const { error } = await user.client.rpc('register_push_subscription', {
    p_endpoint: endpoint,
    p_p256dh: b64url(ecdh.getPublicKey()),
    p_auth: b64url(randomBytes(16)),
    p_user_agent: 'e2e',
  });
  if (error) throw error;
  return endpoint;
}

async function notify(user, body) {
  received = [];
  const { data: session } = await user.client.auth.getSession();
  const res = await fetch(`${FUNCTIONS_URL}/notify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: KEY, authorization: `Bearer ${session.session?.access_token ?? KEY}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  await new Promise((r) => setTimeout(r, 300));
  return { status: res.status, data, endpoints: received.map((r) => r.endpoint) };
}

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

// --- Aufbau: Gruppe mit Anna (Owner), Ben, Carla; Dora ist nicht dabei ------
const anna = await newUser('Anna');
const ben = await newUser('Ben');
const carla = await newUser('Carla');
const dora = await newUser('Dora');

const group = unwrap(await anna.client.rpc('create_group', { p_name: `Push ${stamp}`, p_description: '' }));
const groupId = group.id ?? group;
const invite = unwrap(await anna.client.rpc('create_group_invite', { p_group_id: groupId, p_valid_hours: 24, p_max_uses: 5 }));
const code = (Array.isArray(invite) ? invite[0] : invite).code;
for (const u of [ben, carla]) unwrap(await u.client.rpc('redeem_group_invite', { p_code: code }));

const annaEp = await subscribe(anna);
const benEp = await subscribe(ben);
const carlaEp = await subscribe(carla);
const doraEp = await subscribe(dora);

// --- Öffentlicher Schlüssel --------------------------------------------------
const config = await notify(ben, { type: 'config' });
check(config.status === 200 && typeof config.data?.publicKey === 'string' && config.data.publicKey.length > 80, 'Funktion liefert den öffentlichen VAPID-Schlüssel');

// --- Chat --------------------------------------------------------------------
const msgId = crypto.randomUUID();
unwrap(await anna.client.from('messages').insert({ id: msgId, group_id: groupId, content: 'Treffen 7 Uhr' }));
let r = await notify(anna, { type: 'message', id: msgId });
check(r.status === 200 && r.data?.sent === 2, `Chat: zwei Empfänger (${r.data?.sent})`);
check(r.endpoints.includes(benEp) && r.endpoints.includes(carlaEp), 'Chat: Ben und Carla werden benachrichtigt');
check(!r.endpoints.includes(annaEp), 'Chat: Absenderin selbst nicht');
check(!r.endpoints.includes(doraEp), 'Chat: Nicht-Mitglied nicht');
const sample = received[0];
check(sample?.headers?.['Content-Encoding'] === 'aes128gcm' && /^vapid t=/.test(sample?.headers?.Authorization ?? ''), 'Chat: Anfrage ist verschlüsselt und mit VAPID signiert');
check(sample?.payload?.url === `chat/${groupId}` && sample?.payload?.body?.includes('Anna: Treffen 7 Uhr'), 'Chat: Inhalt und Ziel stimmen');

r = await notify(anna, { type: 'message', id: msgId });
check(r.status === 200 && r.endpoints.length === 0 && r.data?.skipped === 'duplicate', 'Wiederholter Aufruf benachrichtigt nicht noch einmal');
r = await notify(ben, { type: 'message', id: msgId });
check(r.status === 403 && r.endpoints.length === 0, 'Fremde Nachricht kann keine Benachrichtigung auslösen');
r = await notify(dora, { type: 'message', id: msgId });
check(r.status === 403 && r.endpoints.length === 0, 'Nicht-Mitglied kann keine Benachrichtigung auslösen');

unwrap(await carla.client.from('push_subscriptions').update({ notify_chat: false }).eq('endpoint', carlaEp));
const msg2 = crypto.randomUUID();
unwrap(await anna.client.from('messages').insert({ id: msg2, group_id: groupId, content: 'Zweite' }));
r = await notify(anna, { type: 'message', id: msg2 });
check(r.endpoints.length === 1 && r.endpoints[0] === benEp, 'Chat: wer Chat abgeschaltet hat, bekommt nichts');

// --- Nachsuche ---------------------------------------------------------------
const hunt = unwrap(
  await anna.client.from('hunts').insert({ group_id: groupId, title: `Jagd ${stamp}`, starts_at: new Date().toISOString(), status: 'laufend' }).select('id').single(),
);
// Anna ist als Anlegerin automatisch Jagdleiterin.
unwrap(await ben.client.from('hunt_participants').insert({ hunt_id: hunt.id, role: 'schuetze' }));
unwrap(await carla.client.from('hunt_participants').insert({ hunt_id: hunt.id, role: 'hundefuehrer' }));

const shot = unwrap(await ben.client.from('hunt_reports').insert({ hunt_id: hunt.id, kind: 'angeschossen', species: 'Reh' }).select('id').single());
r = await notify(ben, { type: 'report', id: shot.id });
check(r.status === 200 && r.endpoints.length === 2, `Nachsuche: zwei Empfänger (${r.endpoints.length})`);
check(r.endpoints.includes(annaEp) && r.endpoints.includes(carlaEp), 'Nachsuche: Jagdleitung und Hundeführerin');
check(!r.endpoints.includes(benEp) && !r.endpoints.includes(doraEp), 'Nachsuche: nicht der Melder, nicht Fremde');
check(received[0]?.headers?.Urgency === 'high', 'Nachsuche: hohe Dringlichkeit');

const kill = unwrap(await ben.client.from('hunt_reports').insert({ hunt_id: hunt.id, kind: 'erlegt', species: 'Reh' }).select('id').single());
r = await notify(ben, { type: 'report', id: kill.id });
check(r.status === 200 && r.endpoints.length === 0, 'Erlegt löst keine Benachrichtigung aus');
r = await notify(carla, { type: 'report', id: shot.id });
check(r.status === 403, 'Fremde Meldung kann keine Benachrichtigung auslösen');

// --- Ungültige Aufrufe -------------------------------------------------------
r = await notify(anna, { type: 'message', id: 'nicht-uuid' });
check(r.status === 400, 'Ungültige Anfrage wird abgelehnt');
const anon = await notify({ client: createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } }) }, { type: 'config' });
check(anon.status === 401, `Ohne Anmeldung kein Zugriff (${anon.status})`);

// --- Abo übernehmen und löschen ------------------------------------------------
const { data: own } = await ben.client.from('push_subscriptions').select('endpoint');
check(own?.length === 1 && own[0].endpoint === benEp, 'Jeder sieht nur die eigenen Abos');
unwrap(await ben.client.from('push_subscriptions').delete().eq('endpoint', benEp));
const msg3 = crypto.randomUUID();
unwrap(await anna.client.from('messages').insert({ id: msg3, group_id: groupId, content: 'Dritte' }));
r = await notify(anna, { type: 'message', id: msg3 });
check(r.endpoints.length === 0, 'Nach dem Abmelden des Geräts kommt nichts mehr');

// --- Service Worker: Push anzeigen (nur mit APP_URL, also gebauter App) -----
if (process.env.APP_URL) {
  const APP_URL = process.env.APP_URL;
  if (!/localhost|127\.0\.0\.1/.test(APP_URL)) throw new Error('Dieser Test läuft nur gegen eine lokale App.');
  const { chromium } = require('playwright');
  // Volles Chromium (neuer Headless-Modus): die abgespeckte Headless-Variante verbietet Benachrichtigungen.
  const browser = await chromium.launch({ channel: 'chromium' });
  const context = await browser.newContext();
  await context.grantPermissions(['notifications'], { origin: new globalThis.URL(APP_URL).origin });
  const page = await context.newPage();
  await page.goto(APP_URL);
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cdp = await context.newCDPSession(page);
  const registrations = [];
  cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => registrations.push(...e.registrations));
  await cdp.send('ServiceWorker.enable');
  for (let i = 0; i < 50 && registrations.length === 0; i++) await new Promise((r) => setTimeout(r, 100));
  const reg = registrations.find((x) => !x.isDeleted);
  const payload = { title: 'Hegering', body: 'Anna: Treffen 7 Uhr', url: 'chat/abc', tag: 'chat-abc' };
  await cdp.send('ServiceWorker.deliverPushMessage', { origin: new globalThis.URL(APP_URL).origin, registrationId: reg.registrationId, data: JSON.stringify(payload) });
  let shown = [];
  for (let i = 0; i < 50 && shown.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 100));
    shown = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => ({ title: n.title, body: n.body, tag: n.tag, data: n.data })));
  }
  check(shown.length === 1 && shown[0].title === 'Hegering' && shown[0].body === 'Anna: Treffen 7 Uhr' && shown[0].tag === 'chat-abc', 'Service Worker zeigt die Benachrichtigung');
  check(shown[0]?.data?.path === 'chat/abc', 'Benachrichtigung merkt sich das Ziel in der App');
  await browser.close();
}

sink.close();
console.log(process.exitCode ? 'Push-Test FEHLGESCHLAGEN' : 'Push-Test bestanden');
