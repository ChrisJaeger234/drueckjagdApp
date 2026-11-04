// Edge Function „notify“: verschickt Web-Push für neue Chatnachrichten und „angeschossen“-Meldungen.
//
// Aufruf aus der App nach dem erfolgreichen Speichern: { type: 'message' | 'report', id }.
// * Der Aufrufer muss angemeldet sein und die Nachricht bzw. Meldung selbst verfasst haben
//   (geprüft mit seinem eigenen Token, also über RLS).
// * Empfänger und ihre Abos liest die Funktion mit dem Service-Schlüssel, der nur hier auf dem
//   Server liegt (nie in der Web-App).
// * Benötigte Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (z. B. mailto:…).
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { displayName, isAllowedEndpoint, isFresh, MAX_AGE_MS, messagePayload, parseRequest, recipients, REPORT_ROLES, reportPayload, type PushPayload } from './logic.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

const env = (name: string) => Deno.env.get(name) ?? '';
const vapidReady = !!(env('VAPID_PUBLIC_KEY') && env('VAPID_PRIVATE_KEY'));
if (vapidReady) webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:admin@example.com', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
/** Nur für lokale Tests: statt an den Push-Dienst die fertige, verschlüsselte Anfrage hierhin. */
const testSink = env('PUSH_TEST_SINK_URL');

interface Subscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method' });
  if (!vapidReady) return json(503, { error: 'Push ist auf dem Server nicht eingerichtet (VAPID-Secrets fehlen).' });

  const authHeader = req.headers.get('Authorization') ?? '';
  const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: authHeader } } });
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

  const { data: auth } = await asUser.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return json(401, { error: 'unauthenticated' });

  const request = parseRequest(await req.json().catch(() => null));
  if (!request) return json(400, { error: 'bad request' });
  // Öffentlicher VAPID-Schlüssel für pushManager.subscribe (ist zum Weitergeben gedacht).
  if (request.type === 'config') return json(200, { publicKey: env('VAPID_PUBLIC_KEY') });

  let payload: PushPayload;
  let userIds: string[];
  let pref: 'notify_chat' | 'notify_reports';

  if (request.type === 'message') {
    const { data: m } = await asUser
      .from('messages')
      .select('id, group_id, sender_id, content, created_at, group:groups(name), sender:profiles!messages_sender_id_fkey(display_name, username)')
      .eq('id', request.id)
      .maybeSingle();
    if (!m || m.sender_id !== userId) return json(403, { error: 'forbidden' });
    if (!isFresh(m.created_at)) return json(200, { sent: 0, skipped: 'old' });
    const { data: members } = await admin.from('group_members').select('user_id').eq('group_id', m.group_id);
    userIds = recipients((members ?? []).map((x) => x.user_id), userId);
    // deno-lint-ignore no-explicit-any
    payload = messagePayload(m, (m.group as any)?.name ?? 'Gruppenchat', displayName(m.sender as any));
    pref = 'notify_chat';
  } else {
    const { data: r } = await asUser
      .from('hunt_reports')
      .select('id, hunt_id, reporter_id, kind, species, count, created_at, stand:hunt_stands(label), hunt:hunts(title, group_id), reporter:profiles!hunt_reports_reporter_id_fkey(display_name, username)')
      .eq('id', request.id)
      .maybeSingle();
    if (!r || r.reporter_id !== userId) return json(403, { error: 'forbidden' });
    if (r.kind !== 'angeschossen') return json(200, { sent: 0, skipped: 'kind' });
    if (!isFresh(r.created_at)) return json(200, { sent: 0, skipped: 'old' });
    // deno-lint-ignore no-explicit-any
    const hunt = r.hunt as any;
    const [{ data: parts }, { data: leads }] = await Promise.all([
      admin.from('hunt_participants').select('user_id').eq('hunt_id', r.hunt_id).in('role', [...REPORT_ROLES]),
      admin.from('group_members').select('user_id').eq('group_id', hunt?.group_id).in('role', ['owner', 'admin']),
    ]);
    userIds = recipients([...(parts ?? []), ...(leads ?? [])].map((x) => x.user_id), userId);
    // deno-lint-ignore no-explicit-any
    payload = reportPayload(r, hunt?.title ?? 'Jagd', (r.stand as any)?.label ?? null, displayName(r.reporter as any));
    pref = 'notify_reports';
  }

  // Höchstens einmal je Nachricht bzw. Meldung (auch bei wiederholtem Aufruf).
  const { error: dupError } = await admin.from('push_dispatches').insert({ kind: request.type, ref_id: request.id });
  if (dupError) return json(200, { sent: 0, skipped: dupError.code === '23505' ? 'duplicate' : 'error' });
  void admin.from('push_dispatches').delete().lt('created_at', new Date(Date.now() - 2 * MAX_AGE_MS).toISOString()).then(() => undefined);

  if (userIds.length === 0) return json(200, { sent: 0 });
  const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('user_id', userIds).eq(pref, true);
  const targets = ((subs ?? []) as Subscription[]).filter((s) => isAllowedEndpoint(s.endpoint));
  const body = JSON.stringify(payload);
  const options = { TTL: 60 * 60, urgency: (request.type === 'report' ? 'high' : 'normal') as 'high' | 'normal', topic: payload.tag.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, '') };

  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    targets.map(async (s) => {
      const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      try {
        if (testSink) {
          const details = webpush.generateRequestDetails(sub, body, options);
          await fetch(testSink, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: s.endpoint, headers: details.headers, payload, bytes: details.body.length }) });
        } else {
          await webpush.sendNotification(sub, body, options);
        }
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // Abo abgelaufen oder vom Nutzer widerrufen: aufräumen.
        if (status === 404 || status === 410) gone.push(s.id);
      }
    }),
  );
  if (gone.length) await admin.from('push_subscriptions').delete().in('id', gone);
  return json(200, { sent, removed: gone.length });
});
