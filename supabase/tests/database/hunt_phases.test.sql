-- =============================================================================
-- pgTAP-Tests für 0016: Phasen einer Jagd
-- Ausführen: supabase test db
-- p1 Owner/Jagdleitung · p2 Mitglied (Schütze) · p3 Mitglied (Schütze) · p4 fremd
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

create or replace function pg_temp.login(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function pg_temp.u(p text) returns uuid
language sql immutable as $$ select ('00000000-0000-0000-0000-0000000016' || p)::uuid $$;

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;
create or replace function pg_temp.id(p text) returns uuid
language sql stable as $$ select id from ids where name = p $$;

insert into auth.users (id, email, aud, role)
select pg_temp.u(x), x || '@phases.test', 'authenticated', 'authenticated'
from unnest(array['a1', 'a2', 'a3', 'a4']) as x;

select pg_temp.login(pg_temp.u('a1'));
insert into ids select 'G', id from public.create_group('Hegering Phasen');
create temp table codes as select code from public.create_group_invite(pg_temp.id('G'), 24, null);
grant select on codes to authenticated;
select pg_temp.login(pg_temp.u('a2')); select public.redeem_group_invite((select code from codes));
select pg_temp.login(pg_temp.u('a3')); select public.redeem_group_invite((select code from codes));

select pg_temp.login(pg_temp.u('a1'));
with t as (insert into public.hunts (group_id, title, starts_at) values (pg_temp.id('G'), 'Jagd P', now() + interval '2 days') returning id)
insert into ids select 'J', id from t;
with t as (insert into public.hunt_stands (hunt_id, label, latitude, longitude) values (pg_temp.id('J'), 'Stand 1', 51, 7) returning id)
insert into ids select 'S1', id from t;
with t as (insert into public.hunt_stands (hunt_id, label, latitude, longitude) values (pg_temp.id('J'), 'Stand 2', 51.1, 7.1) returning id)
insert into ids select 'S2', id from t;
with t as (insert into public.hunt_participants (hunt_id, user_id, role, stand_id) values (pg_temp.id('J'), pg_temp.u('a2'), 'schuetze', pg_temp.id('S1')) returning id)
insert into ids select 'P2', id from t;
with t as (insert into public.hunt_participants (hunt_id, user_id, role) values (pg_temp.id('J'), pg_temp.u('a3'), 'schuetze') returning id)
insert into ids select 'P3', id from t;

-- Phasen anlegen
select lives_ok(
  format($$insert into public.hunt_phases (hunt_id, name, sort_order) values (%L, 'Phase 1', 1), (%L, 'Phase 2', 2)$$, pg_temp.id('J'), pg_temp.id('J')),
  'Jagdleitung legt Phasen an'
);
insert into ids select 'PH1', id from public.hunt_phases where hunt_id = pg_temp.id('J') and name = 'Phase 1';
insert into ids select 'PH2', id from public.hunt_phases where hunt_id = pg_temp.id('J') and name = 'Phase 2';

-- Zuteilung für Phase 1 und 2 planen
select lives_ok(
  format($$insert into public.hunt_phase_assignments (hunt_id, phase_id, participant_id, stand_id) values
           (%1$L, %2$L, %3$L, %5$L), (%1$L, %4$L, %3$L, %6$L), (%1$L, %4$L, %7$L, %5$L)$$,
         pg_temp.id('J'), pg_temp.id('PH1'), pg_temp.id('P2'), pg_temp.id('PH2'), pg_temp.id('S1'), pg_temp.id('S2'), pg_temp.id('P3')),
  'Jagdleitung plant die Zuteilung je Phase'
);

-- Phase 2 aktivieren: Zuteilung wird übernommen
select lives_ok(format($$select public.activate_hunt_phase(%L, %L)$$, pg_temp.id('J'), pg_temp.id('PH2')), 'Phase 2 aktiviert');
select is((select current_phase_id from public.hunts where id = pg_temp.id('J')), pg_temp.id('PH2'), 'aktive Phase gesetzt');
select is((select stand_id from public.hunt_participants where id = pg_temp.id('P2')), pg_temp.id('S2'), 'p2 steht in Phase 2 auf Stand 2');
select is((select stand_id from public.hunt_participants where id = pg_temp.id('P3')), pg_temp.id('S1'), 'p3 steht in Phase 2 auf Stand 1');

-- Direkte Änderung während aktiver Phase wird in die Phase übernommen
update public.hunt_participants set stand_id = null where id = pg_temp.id('P3');
select is(
  (select stand_id from public.hunt_phase_assignments where phase_id = pg_temp.id('PH2') and participant_id = pg_temp.id('P3')),
  null, 'Änderung landet in der Zuteilung der aktiven Phase'
);

-- Zurück zu Phase 1: p3 hat dort nichts
select lives_ok(format($$select public.activate_hunt_phase(%L, %L)$$, pg_temp.id('J'), pg_temp.id('PH1')), 'Phase 1 aktiviert');
select is((select stand_id from public.hunt_participants where id = pg_temp.id('P2')), pg_temp.id('S1'), 'p2 wieder auf Stand 1');
select is((select stand_id from public.hunt_participants where id = pg_temp.id('P3')), null, 'p3 ohne Stand in Phase 1');

-- Mitglied darf nichts davon
select pg_temp.login(pg_temp.u('a2'));
select is((select count(*)::int from public.hunt_phases where hunt_id = pg_temp.id('J')), 2, 'Mitglied sieht die Phasen');
select throws_ok(
  format($$select public.activate_hunt_phase(%L, %L)$$, pg_temp.id('J'), pg_temp.id('PH2')),
  '42501', null, 'Mitglied kann keine Phase aktivieren'
);
select throws_ok(
  format($$insert into public.hunt_phases (hunt_id, name) values (%L, 'Meine')$$, pg_temp.id('J')),
  '42501', null, 'Mitglied kann keine Phase anlegen'
);
delete from public.hunt_phase_assignments where hunt_id = pg_temp.id('J');
select is((select count(*)::int from public.hunt_phase_assignments where hunt_id = pg_temp.id('J')), 3, 'Mitglied kann keine Zuteilung löschen');

-- Fremde sehen nichts
select pg_temp.login(pg_temp.u('a4'));
select is((select count(*)::int from public.hunt_phase_assignments where hunt_id = pg_temp.id('J')), 0, 'Fremde sehen keine Zuteilung');

-- Phase löschen setzt die aktive Phase zurück
select pg_temp.login(pg_temp.u('a1'));
delete from public.hunt_phases where id = pg_temp.id('PH1');
select is((select current_phase_id from public.hunts where id = pg_temp.id('J')), null, 'gelöschte aktive Phase: Jagd ohne aktive Phase');

select * from finish();
rollback;
