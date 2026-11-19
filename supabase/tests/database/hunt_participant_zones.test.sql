-- =============================================================================
-- pgTAP-Tests für 0018: mehrere Zonen je Teilnehmer und Zonenfarbe
-- Ausführen: supabase test db
-- a1 Owner/Jagdleitung · a2 Mitglied (Treiber) · a3 fremd
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(13);

create or replace function pg_temp.login(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function pg_temp.u(p text) returns uuid
language sql immutable as $$ select ('00000000-0000-0000-0000-0000000018' || p)::uuid $$;

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;
create or replace function pg_temp.id(p text) returns uuid
language sql stable as $$ select id from ids where name = p $$;

insert into auth.users (id, email, aud, role)
select pg_temp.u(x), x || '@zones.test', 'authenticated', 'authenticated'
from unnest(array['a1', 'a2', 'a3']) as x;

select pg_temp.login(pg_temp.u('a1'));
insert into ids select 'G', id from public.create_group('Hegering Zonen');
create temp table codes as select code from public.create_group_invite(pg_temp.id('G'), 24, null);
grant select on codes to authenticated;
select pg_temp.login(pg_temp.u('a2')); select public.redeem_group_invite((select code from codes));

select pg_temp.login(pg_temp.u('a1'));
with t as (insert into public.hunts (group_id, title, starts_at) values (pg_temp.id('G'), 'Jagd Z', now() + interval '2 days') returning id)
insert into ids select 'J', id from t;
with t as (
  insert into public.hunt_zones (hunt_id, name, kind, boundary_data)
  values (pg_temp.id('J'), 'Treiben A', 'treiben', '{"type":"Polygon","coordinates":[[[9.5,51.5],[9.505,51.5],[9.505,51.505],[9.5,51.5]]]}')
  returning id
) insert into ids select 'ZA', id from t;
with t as (
  insert into public.hunt_zones (hunt_id, name, kind, boundary_data)
  values (pg_temp.id('J'), 'Treiben B', 'treiben', '{"type":"Polygon","coordinates":[[[9.6,51.5],[9.605,51.5],[9.605,51.505],[9.6,51.5]]]}')
  returning id
) insert into ids select 'ZB', id from t;
with t as (insert into public.hunt_participants (hunt_id, user_id, role, zone_id) values (pg_temp.id('J'), pg_temp.u('a2'), 'treiber', pg_temp.id('ZA')) returning id)
insert into ids select 'P2', id from t;
with t as (insert into public.hunt_phases (hunt_id, name, sort_order) values (pg_temp.id('J'), 'Phase 1', 1) returning id)
insert into ids select 'PH1', id from t;

-- Zonenfarbe (Spalte gibt es seit 0010)
select lives_ok(format($$update public.hunt_zones set color = '#5e35b1' where id = %L$$, pg_temp.id('ZB')), 'Jagdleitung setzt eine eigene Zonenfarbe');
select is((select color from public.hunt_zones where id = pg_temp.id('ZB')), '#5e35b1', 'Farbe ist gespeichert');
select is((select color from public.hunt_zones where id = pg_temp.id('ZA')), null, 'andere Zone derselben Art bleibt bei der Art-Farbe');

-- Weitere Zonen: ohne Phase und je Phase
select lives_ok(
  format($$insert into public.hunt_participant_zones (hunt_id, participant_id, zone_id) values (%L, %L, %L)$$, pg_temp.id('J'), pg_temp.id('P2'), pg_temp.id('ZB')),
  'Jagdleitung teilt eine weitere Zone zu'
);
select lives_ok(
  format($$insert into public.hunt_participant_zones (hunt_id, participant_id, zone_id, phase_id) values (%L, %L, %L, %L)$$, pg_temp.id('J'), pg_temp.id('P2'), pg_temp.id('ZB'), pg_temp.id('PH1')),
  'dieselbe Zone in einer Phase ist ein eigener Eintrag'
);
select throws_ok(
  format($$insert into public.hunt_participant_zones (hunt_id, participant_id, zone_id) values (%L, %L, %L)$$, pg_temp.id('J'), pg_temp.id('P2'), pg_temp.id('ZB')),
  '23505', null, 'keine doppelte Zone ohne Phase'
);

-- Mitglied liest, darf aber nichts ändern
select pg_temp.login(pg_temp.u('a2'));
select is((select count(*)::int from public.hunt_participant_zones where participant_id = pg_temp.id('P2')), 2, 'Treiber sieht seine weiteren Zonen');
select throws_ok(
  format($$insert into public.hunt_participant_zones (hunt_id, participant_id, zone_id) values (%L, %L, %L)$$, pg_temp.id('J'), pg_temp.id('P2'), pg_temp.id('ZA')),
  '42501', null, 'Mitglied kann sich keine Zone geben'
);
delete from public.hunt_participant_zones where participant_id = pg_temp.id('P2');
select is((select count(*)::int from public.hunt_participant_zones where participant_id = pg_temp.id('P2')), 2, 'Mitglied kann keine Zone entfernen');
update public.hunt_zones set color = '#000000' where id = pg_temp.id('ZA');
select is((select color from public.hunt_zones where id = pg_temp.id('ZA')), null, 'Mitglied kann keine Zonenfarbe ändern');

-- Fremde sehen nichts
select pg_temp.login(pg_temp.u('a3'));
select is((select count(*)::int from public.hunt_participant_zones where hunt_id = pg_temp.id('J')), 0, 'Fremde sehen keine Zuteilung');

-- Löschen räumt auf
select pg_temp.login(pg_temp.u('a1'));
delete from public.hunt_phases where id = pg_temp.id('PH1');
select is((select count(*)::int from public.hunt_participant_zones where participant_id = pg_temp.id('P2')), 1, 'Phase gelöscht: ihre weiteren Zonen sind weg');
delete from public.hunt_zones where id = pg_temp.id('ZB');
select is((select count(*)::int from public.hunt_participant_zones where participant_id = pg_temp.id('P2')), 0, 'Zone gelöscht: Zuteilung ist weg');

select * from finish();
rollback;
