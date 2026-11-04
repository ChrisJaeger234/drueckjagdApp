-- =============================================================================
-- pgTAP-Tests für Migration 0006 (Härtung nach dem Phase-1-Review) sowie
-- ergänzende Sicherheitsprüfungen.
-- Ausführen: supabase test db
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

create or replace function pg_temp.as_admin() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local',  'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@test.local',  'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'member@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a4', 'solo@test.local',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a5', 'other@test.local',  'authenticated', 'authenticated');

-- Gruppe H: owner (a1), admin (a2), member (a3)
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
create temp table ctx as
  select (select id from public.create_group('Gruppe H')) as group_h;
grant select on ctx to authenticated;

create temp table inv as
  select code from public.create_group_invite((select group_h from ctx), 24, 5);
grant select on inv to authenticated;

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select public.redeem_group_invite((select code from inv));
select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select public.redeem_group_invite((select code from inv));

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select public.set_group_member_role((select group_h from ctx),
  '00000000-0000-0000-0000-0000000000a2', 'admin');

-- 1
select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select is(
  public.redeem_group_invite((select code from inv)),
  (select group_h from ctx),
  'Erneutes Einlösen als Mitglied liefert die Gruppe'
);

-- 2
select pg_temp.as_admin();
select is(
  (select use_count from public.group_invites where group_id = (select group_h from ctx)),
  2,
  'Erneutes Einlösen als Mitglied verbraucht keine Nutzung'
);

-- 3
insert into public.group_invite_attempts (user_id, attempted_at)
values ('00000000-0000-0000-0000-0000000000a5', now() - interval '2 days');
select pg_temp.login('00000000-0000-0000-0000-0000000000a5');
select public.redeem_group_invite('0000-0000-0000');
select pg_temp.as_admin();
select is(
  (select count(*)::int from public.group_invite_attempts
    where user_id = '00000000-0000-0000-0000-0000000000a5'),
  1,
  'Alte Fehlversuche werden beim Einlösen aufgeräumt'
);

-- 4
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select lives_ok(
  $$ insert into public.reviere (group_id, name) values ((select group_h from ctx), 'Ohne created_by') $$,
  'created_by wird automatisch auf den angemeldeten Benutzer gesetzt'
);

-- 5
select is(
  (select created_by from public.reviere where name = 'Ohne created_by'),
  '00000000-0000-0000-0000-0000000000a2'::uuid,
  'Standardwert created_by = auth.uid()'
);

-- 6
select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select throws_ok(
  $$ insert into public.reviere (group_id, name, created_by)
     values ((select group_h from ctx), 'Fremd', '00000000-0000-0000-0000-0000000000a1') $$,
  '42501',
  null,
  'created_by kann nicht auf einen anderen Benutzer gefälscht werden'
);

-- 7
select throws_ok(
  $$ insert into public.messages (group_id, sender_id, content)
     values ((select group_h from ctx), '00000000-0000-0000-0000-0000000000a1', 'gefälscht') $$,
  '42501',
  null,
  'Nachrichten können nicht im Namen anderer gesendet werden'
);

-- 8
select lives_ok(
  $$ insert into public.messages (group_id, content) values ((select group_h from ctx), 'Hallo') $$,
  'sender_id wird automatisch gesetzt'
);

-- 9
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('avatars', '00000000-0000-0000-0000-0000000000a1/fremd.png') $$,
  '42501',
  null,
  'Profilbilder können nicht in fremde Ordner hochgeladen werden'
);

-- 10
select throws_ok(
  $$ select public.handle_new_user() $$,
  '42501',
  null,
  'Interne Trigger-Funktion ist nicht per RPC aufrufbar'
);

-- 11
select throws_ok(
  $$ select private.lock_group((select group_h from ctx)) $$,
  '42501',
  null,
  'Interne Sperrfunktion ist für Clients nicht aufrufbar'
);

-- 12: Kontolöschung des einzigen Owners → Admin wird Owner
select pg_temp.as_admin();
delete from auth.users where id = '00000000-0000-0000-0000-0000000000a1';
select is(
  (select role::text from public.group_members
    where group_id = (select group_h from ctx)
      and user_id = '00000000-0000-0000-0000-0000000000a2'),
  'owner',
  'Nach Löschung des einzigen Owners wird der Admin automatisch Owner'
);

-- 13
select is(
  (select count(*)::int from public.group_members
    where group_id = (select group_h from ctx) and role = 'owner'),
  1,
  'Die Gruppe hat genau einen Owner'
);

-- 14: einziges Mitglied löscht sein Konto → leere Gruppe wird entfernt
select pg_temp.login('00000000-0000-0000-0000-0000000000a4');
create temp table solo as select (select id from public.create_group('Solo')) as group_s;
select pg_temp.as_admin();
delete from auth.users where id = '00000000-0000-0000-0000-0000000000a4';
select is(
  (select count(*)::int from public.groups where id = (select group_s from solo)),
  0,
  'Leere Gruppe wird nach Löschung des letzten Mitglieds entfernt'
);

-- 15: Owner löscht die Gruppe – Trigger stört nicht
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select lives_ok(
  $$ delete from public.groups where id = (select group_h from ctx) $$,
  'Owner kann die Gruppe weiterhin löschen'
);

-- 16
select pg_temp.as_admin();
select is(
  (select count(*)::int from public.group_members where group_id = (select group_h from ctx)),
  0,
  'Mitgliedschaften werden mit der Gruppe gelöscht'
);

select * from finish();
rollback;
