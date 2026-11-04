-- =============================================================================
-- pgTAP-Tests für Phase 9: Gruppenchat (0003 + 0012)
-- Ausführen: supabase test db
-- Personen: c1 Owner · c2 Mitglied · c3 Außenstehender
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
language sql immutable as $$ select ('00000000-0000-0000-0000-0000000002' || p)::uuid $$;

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;
create or replace function pg_temp.id(p text) returns uuid
language sql stable as $$ select id from ids where name = p $$;

insert into auth.users (id, email, aud, role)
select pg_temp.u(x), x || '@chat.test', 'authenticated', 'authenticated'
from unnest(array['c1', 'c2', 'c3']) as x;

select pg_temp.login(pg_temp.u('c1'));
insert into ids select 'G', id from public.create_group('Chatgruppe');
create temp table codes as select code from public.create_group_invite(pg_temp.id('G'), 24, null);
grant select on codes to authenticated;
select pg_temp.login(pg_temp.u('c2')); select public.redeem_group_invite((select code from codes));
select pg_temp.login(pg_temp.u('c3')); select public.create_group('Andere');

-- 1
select pg_temp.login(pg_temp.u('c2'));
select lives_ok(
  format($$insert into public.messages (id, group_id, content, created_at) values ('00000000-0000-0000-0000-00000000c001', %L, 'Treffen 7 Uhr am Hof', now() - interval '3 days')$$, pg_temp.id('G')),
  'Mitglied schreibt mit eigener ID');
-- 2
select ok(
  (select created_at > now() - interval '1 minute' from public.messages where id = '00000000-0000-0000-0000-00000000c001'),
  'created_at setzt der Server (kein Rückdatieren)');
-- 3
select is((select sender_id from public.messages where id = '00000000-0000-0000-0000-00000000c001'), pg_temp.u('c2'), 'Absender ist automatisch der Benutzer');
-- 4
select throws_ok(
  format($$insert into public.messages (id, group_id, content) values ('00000000-0000-0000-0000-00000000c001', %L, 'nochmal')$$, pg_temp.id('G')),
  '23505', null, 'Gleiche ID zweimal: Dublette wird abgewiesen');
-- 5
select throws_ok(
  format($$insert into public.messages (group_id, sender_id, content) values (%L, %L, 'gefälscht')$$, pg_temp.id('G'), pg_temp.u('c1')),
  '42501', null, 'Niemand schreibt im Namen anderer');
-- 6
select pg_temp.login(pg_temp.u('c3'));
select throws_ok(format($$insert into public.messages (group_id, content) values (%L, 'hallo')$$, pg_temp.id('G')), '42501', null, 'Außenstehende schreiben nicht');
-- 7
select is((select count(*)::integer from public.messages where group_id = pg_temp.id('G')), 0, 'Außenstehende lesen nicht');
-- 8
select pg_temp.login(pg_temp.u('c1'));
delete from public.messages where id = '00000000-0000-0000-0000-00000000c001';
select is((select count(*)::integer from public.messages where group_id = pg_temp.id('G')), 1, 'Fremde Nachrichten lassen sich nicht löschen');
-- 9
select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages'),
  'messages ist für Realtime freigegeben');

select * from finish();
rollback;
