-- =============================================================================
-- pgTAP-Tests für Phase 9 Teil 2: Push-Abos (0013)
-- Personen: f1, f2
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(9);

create or replace function pg_temp.login(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function pg_temp.u(p text) returns uuid
language sql immutable as $$ select ('00000000-0000-0000-0000-0000000003' || p)::uuid $$;

insert into auth.users (id, email, aud, role)
select pg_temp.u(x), x || '@push.test', 'authenticated', 'authenticated'
from unnest(array['f1', 'f2']) as x;

-- 1
select pg_temp.login(pg_temp.u('f1'));
select lives_ok($$select public.register_push_subscription('https://push.example/abc', 'key', 'auth', 'iPhone')$$, 'Gerät anmelden');
-- 2
select is((select count(*)::integer from public.push_subscriptions), 1, 'Eigenes Abo sichtbar');
-- 3
select lives_ok($$select public.register_push_subscription('https://push.example/abc', 'key2', 'auth2', 'iPhone', false, true)$$, 'Erneut anmelden ändert nur Einstellungen');
select is((select notify_chat::text || p256dh from public.push_subscriptions), 'falsekey2', 'Einstellungen und Schlüssel übernommen');
-- 5
select throws_ok($$insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://push.example/x', 'k', 'a')$$, '42501', null, 'Direktes Einfügen nur über die RPC');
-- 6
select throws_ok($$select public.register_push_subscription('http://evil.local/x', 'k', 'a')$$, '23514', null, 'Nur https-Endpunkte');

-- 7
select pg_temp.login(pg_temp.u('f2'));
select is((select count(*)::integer from public.push_subscriptions), 0, 'Fremde Abos unsichtbar');
-- 8: Gerätewechsel – f2 meldet sich auf demselben Gerät an
select public.register_push_subscription('https://push.example/abc', 'key3', 'auth3', 'iPhone');
select pg_temp.login(pg_temp.u('f1'));
select is((select count(*)::integer from public.push_subscriptions), 0, 'Abo geht beim Gerätewechsel auf den neuen Benutzer über');
-- 9
select is(
  (select count(*)::integer from (select 1 from public.push_subscriptions where endpoint = 'https://push.example/abc') t),
  0, 'f1 kann das übernommene Abo nicht lesen');

select * from finish();
rollback;
