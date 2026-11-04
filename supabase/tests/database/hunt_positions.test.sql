-- =============================================================================
-- pgTAP-Tests für Phase 8: Live-Standorte (0011)
-- Ausführen: supabase test db
--
-- Personen:  e1 Owner (legt die Jagd an, wird Jagdleiter) · e2 Admin (ohne Teilnahme)
--            e3 Treiber · e4 Schütze · e6 Hundeführer · e5 Außenstehender
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(25);

create or replace function pg_temp.login(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function pg_temp.u(p text) returns uuid
language sql immutable as $$ select ('00000000-0000-0000-0000-0000000001' || p)::uuid $$;

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;
create or replace function pg_temp.id(p text) returns uuid
language sql stable as $$ select id from ids where name = p $$;

create or replace function pg_temp.affected(p_sql text) returns integer
language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function pg_temp.share(p_lat double precision) returns text
language sql as $$
  select format($f$insert into public.hunt_positions (hunt_id, latitude, longitude, accuracy) values (%L, %s, 9.5, 8)$f$, pg_temp.id('J'), p_lat)
$$;

create or replace function pg_temp.visible() returns integer
language sql stable as $$ select count(*)::integer from public.hunt_positions where hunt_id = pg_temp.id('J') $$;

insert into auth.users (id, email, aud, role)
select pg_temp.u(x), x || '@pos.test', 'authenticated', 'authenticated'
from unnest(array['e1', 'e2', 'e3', 'e4', 'e5', 'e6']) as x;

select pg_temp.login(pg_temp.u('e1'));
insert into ids select 'G', id from public.create_group('Hegering Live');
create temp table codes as select code from public.create_group_invite(pg_temp.id('G'), 24, null);
grant select on codes to authenticated;
select pg_temp.login(pg_temp.u('e2')); select public.redeem_group_invite((select code from codes));
select pg_temp.login(pg_temp.u('e3')); select public.redeem_group_invite((select code from codes));
select pg_temp.login(pg_temp.u('e4')); select public.redeem_group_invite((select code from codes));
select pg_temp.login(pg_temp.u('e6')); select public.redeem_group_invite((select code from codes));
select pg_temp.login(pg_temp.u('e5')); select public.create_group('Fremde Gruppe');
select pg_temp.login(pg_temp.u('e1'));
select public.set_group_member_role(pg_temp.id('G'), pg_temp.u('e2'), 'admin');
with t as (insert into public.hunts (group_id, title, starts_at) values (pg_temp.id('G'), 'Live-Jagd', now()) returning id)
insert into ids select 'J', id from t;

select pg_temp.login(pg_temp.u('e3'));
insert into public.hunt_participants (hunt_id, role) values (pg_temp.id('J'), 'treiber');
select pg_temp.login(pg_temp.u('e4'));
insert into public.hunt_participants (hunt_id, role) values (pg_temp.id('J'), 'schuetze');
select pg_temp.login(pg_temp.u('e6'));
insert into public.hunt_participants (hunt_id, role) values (pg_temp.id('J'), 'hundefuehrer');

-- 1
select pg_temp.login(pg_temp.u('e3'));
select throws_ok(pg_temp.share(51.5), '42501', null, 'Vor Beginn der Jagd teilt niemand seinen Standort');

select pg_temp.login(pg_temp.u('e1'));
update public.hunts set status = 'laufend' where id = pg_temp.id('J');

-- 2
select pg_temp.login(pg_temp.u('e3'));
select lives_ok(pg_temp.share(51.5), 'Treiber teilt während der laufenden Jagd');
-- 3
select throws_ok(
  format($$insert into public.hunt_positions (hunt_id, user_id, latitude, longitude) values (%L, %L, 51, 9)$$, pg_temp.id('J'), pg_temp.u('e4')),
  '42501', null, 'Niemand teilt einen Standort im Namen anderer');
-- 4
select throws_ok(
  format($$insert into public.hunt_positions (hunt_id, latitude, longitude, updated_at) values (%L, 51, 9, now() - interval '1 day')$$, pg_temp.id('J')),
  '42501', null, 'Zeitstempel setzt nur der Server');
-- 5
select pg_temp.login(pg_temp.u('e4'));
select throws_ok(pg_temp.share(51.5), '42501', null, 'Schützen teilen keinen Standort');
-- 6
select pg_temp.login(pg_temp.u('e6'));
select lives_ok(pg_temp.share(51.6), 'Hundeführer teilt');
-- 7
select pg_temp.login(pg_temp.u('e1'));
select lives_ok(pg_temp.share(51.7), 'Jagdleiter teilt');

-- 8
select pg_temp.login(pg_temp.u('e4'));
select is(pg_temp.visible(), 0, 'Schütze sieht keine fremden Positionen');
-- 9
select pg_temp.login(pg_temp.u('e3'));
select is(pg_temp.visible(), 3, 'Treiber sieht alle geteilten Positionen');
-- 10
select pg_temp.login(pg_temp.u('e2'));
select is(pg_temp.visible(), 3, 'Admin der Gruppe sieht die Positionen auch ohne Teilnahme');
-- 11
select pg_temp.login(pg_temp.u('e5'));
select is(pg_temp.visible(), 0, 'Außenstehende sehen nichts');

-- 12
select pg_temp.login(pg_temp.u('e3'));
select is(
  pg_temp.affected(format($$update public.hunt_positions set latitude = 51.55 where hunt_id = %L and user_id = %L$$, pg_temp.id('J'), pg_temp.u('e3'))),
  1, 'Treiber aktualisiert die eigene Position');
-- 13
select is(
  pg_temp.affected(format($$update public.hunt_positions set latitude = 0 where hunt_id = %L and user_id = %L$$, pg_temp.id('J'), pg_temp.u('e6'))),
  0, 'Fremde Positionen lassen sich nicht ändern');
-- 14
select is(
  pg_temp.affected(format($$delete from public.hunt_positions where hunt_id = %L and user_id = %L$$, pg_temp.id('J'), pg_temp.u('e6'))),
  0, 'Treiber löscht keine fremden Positionen');
-- 15
select is(
  (select upsert_ok from (
     select pg_temp.affected(format(
       $$insert into public.hunt_positions (hunt_id, latitude, longitude) values (%L, 51.56, 9.5)
         on conflict (hunt_id, user_id) do update set latitude = excluded.latitude, longitude = excluded.longitude, accuracy = excluded.accuracy$$,
       pg_temp.id('J'))) as upsert_ok) t),
  1, 'Upsert der eigenen Position (wie die App) funktioniert');

-- 15b
select lives_ok(format($$select public.share_hunt_position(%L, 51.57, 9.51, 5)$$, pg_temp.id('J')), 'RPC share_hunt_position aktualisiert die eigene Position');
select is(
  (select latitude from public.hunt_positions where hunt_id = pg_temp.id('J') and user_id = pg_temp.u('e3')),
  51.57::double precision, 'Position wurde übernommen');
-- 15c
select pg_temp.login(pg_temp.u('e4'));
select throws_ok(format($$select public.share_hunt_position(%L, 51, 9)$$, pg_temp.id('J')), '42501', null, 'RPC hält sich an die Regeln (Schütze)');

-- 16
select pg_temp.login(pg_temp.u('e1'));
update public.hunt_participants set role = 'schuetze' where hunt_id = pg_temp.id('J') and user_id = pg_temp.u('e6');
select is(
  (select count(*)::integer from public.hunt_positions where hunt_id = pg_temp.id('J') and user_id = pg_temp.u('e6')),
  0, 'Wechsel zum Schützen löscht die geteilte Position');
-- 17
select pg_temp.login(pg_temp.u('e6'));
select throws_ok(pg_temp.share(51.6), '42501', null, 'Als Schütze kann er nicht mehr teilen');
-- 18
select is(pg_temp.visible(), 0, 'und sieht die anderen nicht mehr');

-- 19
select pg_temp.login(pg_temp.u('e3'));
select public.stop_hunt_position(pg_temp.id('J'));
select public.share_hunt_position(pg_temp.id('J'), 51.5, 9.5);
delete from public.hunt_participants where hunt_id = pg_temp.id('J') and user_id = pg_temp.u('e3');
select is(
  (select count(*)::integer from public.hunt_positions where user_id = pg_temp.u('e3')),
  0, 'Austragen löscht die eigene Position');

-- 20
select pg_temp.login(pg_temp.u('e1'));
select is(pg_temp.visible(), 1, 'Nur noch die Position des Jagdleiters');
-- 21
update public.hunts set status = 'beendet' where id = pg_temp.id('J');
select is(pg_temp.visible(), 0, 'Ende der Jagd löscht alle Live-Positionen');
-- 22
select throws_ok(pg_temp.share(51.7), '42501', null, 'Nach dem Ende teilt niemand mehr');

select * from finish();
rollback;
