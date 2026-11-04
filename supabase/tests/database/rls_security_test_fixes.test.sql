-- =============================================================================
-- pgTAP-Tests für Migration 0007 (Fixes aus dem RLS-Sicherheitstest)
-- Ausführen: supabase test db
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(12);

create or replace function pg_temp.login(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function pg_temp.as_admin() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000000c1', 'owner7@test.local',    'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c2', 'admin7@test.local',    'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c3', 'member7@test.local',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c4', 'outsider7@test.local', 'authenticated', 'authenticated');

-- Gruppe: Owner c1, Admin c2, Mitglied c3. Code „alt“ ist mehrfach nutzbar.
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
create temp table ctx7 as
  select (select id from public.create_group('Gruppe 0007')) as g;
grant select on ctx7 to authenticated;

create temp table inv7 (name text primary key, code text);
grant select on inv7 to authenticated;
insert into inv7 select 'alt', code from public.create_group_invite((select g from ctx7), 24, null);

select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
select public.redeem_group_invite((select code from inv7 where name = 'alt'));
select pg_temp.login('00000000-0000-0000-0000-0000000000c3');
select public.redeem_group_invite((select code from inv7 where name = 'alt'));
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select public.set_group_member_role((select g from ctx7), '00000000-0000-0000-0000-0000000000c2', 'admin');

-- 1: Außenstehender bekommt immer not_authorized, auch für Nicht-Mitglieder
select pg_temp.login('00000000-0000-0000-0000-0000000000c4');
select throws_ok(
  format($$select public.remove_group_member(%L, %L)$$,
         (select g from ctx7), '00000000-0000-0000-0000-0000000000c3'),
  '42501', 'not_authorized',
  'Außenstehender: Entfernen eines Mitglieds → not_authorized'
);

-- 2
select throws_ok(
  format($$select public.remove_group_member(%L, %L)$$,
         (select g from ctx7), '00000000-0000-0000-0000-0000000000ff'),
  '42501', 'not_authorized',
  'Außenstehender: Entfernen eines Nicht-Mitglieds → ebenfalls not_authorized (keine Mitgliedschafts-Abfrage)'
);

-- 3: Einfaches Mitglied ebenso
select pg_temp.login('00000000-0000-0000-0000-0000000000c3');
select throws_ok(
  format($$select public.remove_group_member(%L, %L)$$,
         (select g from ctx7), '00000000-0000-0000-0000-0000000000c4'),
  '42501', 'not_authorized',
  'Mitglied darf niemanden entfernen'
);

-- 4: Admin darf den Owner weiterhin nicht entfernen
select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
select throws_ok(
  format($$select public.remove_group_member(%L, %L)$$,
         (select g from ctx7), '00000000-0000-0000-0000-0000000000c1'),
  '42501', 'not_authorized',
  'Admin kann den Owner nicht entfernen'
);

-- 5: Admin mit Freigabe entfernt das Mitglied
select lives_ok(
  format($$select public.remove_group_member(%L, %L)$$,
         (select g from ctx7), '00000000-0000-0000-0000-0000000000c3'),
  'Admin mit Freigabe entfernt ein einfaches Mitglied'
);

-- 6: Entfernung wird protokolliert
select pg_temp.as_admin();
-- Innerhalb einer Transaktion liefert now() immer denselben Wert. Damit die
-- Reihenfolge „alter Code → Entfernung → neuer Code“ wie im echten Betrieb
-- abgebildet ist, werden die Zeitpunkte zurückdatiert.
update public.group_invites set created_at = now() - interval '2 hours'
  where group_id = (select g from ctx7);
update public.group_member_removals set removed_at = now() - interval '1 hour'
  where group_id = (select g from ctx7);
select is(
  (select removed_by from public.group_member_removals
    where group_id = (select g from ctx7) and user_id = '00000000-0000-0000-0000-0000000000c3'),
  '00000000-0000-0000-0000-0000000000c2'::uuid,
  'Entfernung wird mit entfernender Person protokolliert'
);

-- 7: Kein Clientzugriff auf das Protokoll
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select throws_ok(
  $$select * from public.group_member_removals$$,
  '42501', null,
  'group_member_removals ist für Clients nicht lesbar'
);

-- 8: Alter Code funktioniert für die entfernte Person nicht mehr
select pg_temp.login('00000000-0000-0000-0000-0000000000c3');
select is(
  public.redeem_group_invite((select code from inv7 where name = 'alt')),
  null,
  'Entferntes Mitglied kann mit altem Code nicht wieder beitreten'
);

-- 9
select pg_temp.as_admin();
select is(
  (select count(*)::int from public.group_members
    where group_id = (select g from ctx7) and user_id = '00000000-0000-0000-0000-0000000000c3'),
  0,
  'Entferntes Mitglied bleibt draußen'
);

-- 10: Der alte Code funktioniert für andere weiterhin
select pg_temp.login('00000000-0000-0000-0000-0000000000c4');
select is(
  public.redeem_group_invite((select code from inv7 where name = 'alt')),
  (select g from ctx7),
  'Alter Code funktioniert für andere Personen weiterhin'
);

-- 11: Neue Einladung nach der Entfernung = bewusste Wiederaufnahme
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
insert into inv7 select 'neu', code from public.create_group_invite((select g from ctx7), 24, 1);
select pg_temp.login('00000000-0000-0000-0000-0000000000c3');
select is(
  public.redeem_group_invite((select code from inv7 where name = 'neu')),
  (select g from ctx7),
  'Mit einer neuen Einladung kann die Person wieder aufgenommen werden'
);

-- 12: Freiwilliges Verlassen sperrt nicht
select pg_temp.login('00000000-0000-0000-0000-0000000000c4');
select public.leave_group((select g from ctx7));
select is(
  public.redeem_group_invite((select code from inv7 where name = 'alt')),
  (select g from ctx7),
  'Wer freiwillig austritt, kann mit dem alten Code wieder beitreten'
);

select * from finish();
rollback;
