-- =============================================================================
-- pgTAP-Tests für 0015: Art (category) für Stände einer Jagd
-- Ausführen: supabase test db
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(7);

create or replace function pg_temp.login(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function pg_temp.u(p text) returns uuid
language sql immutable as $$ select ('00000000-0000-0000-0000-0000000015' || p)::uuid $$;

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;
create or replace function pg_temp.id(p text) returns uuid
language sql stable as $$ select id from ids where name = p $$;

insert into auth.users (id, email, aud, role)
select pg_temp.u(x), x || '@stand-category.test', 'authenticated', 'authenticated'
from unnest(array['c1', 'c2']) as x;

select pg_temp.login(pg_temp.u('c1'));
insert into ids select 'G', id from public.create_group('Hegering Kategorie');
create temp table codes as select code from public.create_group_invite(pg_temp.id('G'), 24, null);
grant select on codes to authenticated;
select pg_temp.login(pg_temp.u('c2')); select public.redeem_group_invite((select code from codes));
select pg_temp.login(pg_temp.u('c1'));
with t as (
  insert into public.reviere (group_id, created_by, name) values (pg_temp.id('G'), pg_temp.u('c1'), 'Revier K') returning id
) insert into ids select 'R', id from t;
with t as (
  insert into public.waypoints (revier_id, name, category, latitude, longitude)
  values (pg_temp.id('R'), 'Langer Kanzel', 'kanzel', 51.16, 7.24) returning id
) insert into ids select 'W', id from t;
with t as (
  insert into public.hunts (group_id, revier_id, title, starts_at)
  values (pg_temp.id('G'), pg_temp.id('R'), 'Jagd K', now() + interval '3 days') returning id
) insert into ids select 'J', id from t;

select has_column('public', 'hunt_stands', 'category', 'hunt_stands.category existiert');
select col_is_null('public', 'hunt_stands', 'category', 'category ist optional (bisherige Stände bleiben gültig)');

select lives_ok(
  format($$insert into public.hunt_stands (hunt_id, label, waypoint_id, category, latitude, longitude)
           values (%L, 'Stand 1 Kanzel', %L, 'drueckjagdbock', 51.16, 7.24)$$, pg_temp.id('J'), pg_temp.id('W')),
  'Jagdleitung übernimmt eine Einrichtung mit eigener Art'
);
select is(
  (select category::text from public.hunt_stands where hunt_id = pg_temp.id('J') and label = 'Stand 1 Kanzel'),
  'drueckjagdbock', 'Art gespeichert'
);
select lives_ok(
  format($$update public.hunt_stands set category = 'sammelplatz' where hunt_id = %L$$, pg_temp.id('J')),
  'Jagdleitung ändert die Art'
);
select is(
  (select category::text from public.hunt_stands where hunt_id = pg_temp.id('J')),
  'sammelplatz', 'Art geändert'
);

select pg_temp.login(pg_temp.u('c2'));
select throws_ok(
  format($$insert into public.hunt_stands (hunt_id, label, category, latitude, longitude) values (%L, 'Fremd', 'hochsitz', 51, 7)$$, pg_temp.id('J')),
  '42501', null,
  'Einfaches Mitglied kann keinen Stand mit Art anlegen'
);

select * from finish();
rollback;
