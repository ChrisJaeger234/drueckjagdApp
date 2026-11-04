-- =============================================================================
-- pgTAP-Tests für Row Level Security und Gruppen-Funktionen.
-- Ausführen: supabase test db
--
-- Szenario:
--   Gruppe A: alice (owner), bob (admin), carol (member)
--   Gruppe B: dave (owner)
--   eve: ohne Gruppe
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(57);

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen für die Tests
-- ---------------------------------------------------------------------------
create or replace function pg_temp.login(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function pg_temp.logout_to_anon() returns void
language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
end;
$$;

create or replace function pg_temp.as_admin() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Testbenutzer anlegen (Trigger erzeugt die Profile)
insert into auth.users (id, email, raw_user_meta_data, aud, role)
values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.local', '{"display_name":"Alice"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@test.local',   '{}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@test.local', '{}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@test.local',  '{}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000e', 'eve@test.local',   '{}', 'authenticated', 'authenticated');

-- 1
select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'Alice',
  'Profil wird bei Registrierung automatisch angelegt'
);

-- ---------------------------------------------------------------------------
-- Gruppen anlegen und Mitglieder per Einladung aufnehmen
-- ---------------------------------------------------------------------------
create temp table ids (key text primary key, value text);
grant all on ids to authenticated, anon;

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into ids select 'group_a', (public.create_group('Gruppe A', 'Testgruppe')).id::text;

-- 2
select is(
  (select role::text from public.group_members
   where group_id = (select value::uuid from ids where key = 'group_a')
     and user_id = '00000000-0000-0000-0000-00000000000a'),
  'owner',
  'Ersteller wird Owner der Gruppe'
);

insert into ids select 'invite_a', code from public.create_group_invite(
  (select value::uuid from ids where key = 'group_a'), 24, null);

-- 3
select matches(
  (select value from ids where key = 'invite_a'),
  '^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$',
  'Einladungscode hat das Format XXXX-XXXX-XXXX (Crockford-Base32)'
);

select pg_temp.as_admin();
-- 4
select is(
  (select count(*)::int from public.group_invites
   where code_hash = convert_to((select value from ids where key = 'invite_a'), 'UTF8')),
  0,
  'Einladungscode wird nicht im Klartext gespeichert'
);
-- 5
select is(
  (select count(*)::int from public.group_invites
   where code_hash = extensions.digest((select value from ids where key = 'invite_a'), 'sha256')),
  0,
  'Gespeicherter Hash bezieht sich auf den normalisierten Code (ohne Bindestriche)'
);
-- 6
select is(
  (select count(*)::int from public.group_invites
   where code_hash = extensions.digest(replace((select value from ids where key = 'invite_a'), '-', ''), 'sha256')),
  1,
  'SHA-256 des normalisierten Codes ist gespeichert'
);

-- bob und carol treten bei (Code in Kleinbuchstaben und ohne Bindestriche → normalisiert)
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
-- 7
select is(
  public.redeem_group_invite(lower(replace((select value from ids where key = 'invite_a'), '-', ''))),
  (select value::uuid from ids where key = 'group_a'),
  'Einladung kann eingelöst werden (Groß-/Kleinschreibung egal)'
);

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select public.redeem_group_invite((select value from ids where key = 'invite_a'));

-- alice ernennt bob zum Admin
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.set_group_member_role(
  (select value::uuid from ids where key = 'group_a'),
  '00000000-0000-0000-0000-00000000000b', 'admin');

-- 8
select is(
  (select count(*)::int from public.group_members
   where group_id = (select value::uuid from ids where key = 'group_a')),
  3,
  'Gruppe A hat drei Mitglieder'
);

-- dave legt Gruppe B an
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
insert into ids select 'group_b', (public.create_group('Gruppe B', '')).id::text;

-- ---------------------------------------------------------------------------
-- Sichtbarkeit von Gruppen und Mitgliedschaften
-- ---------------------------------------------------------------------------
-- 9
select is((select count(*)::int from public.groups), 1, 'dave sieht nur seine eigene Gruppe');
-- 10
select is(
  (select count(*)::int from public.group_members
   where group_id = (select value::uuid from ids where key = 'group_a')),
  0,
  'dave sieht keine Mitglieder von Gruppe A'
);
-- 11
select is(
  (select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  0,
  'dave sieht das Profil von alice nicht (keine gemeinsame Gruppe)'
);

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
-- 12
select is((select count(*)::int from public.groups), 1, 'carol sieht Gruppe A');
-- 13
select is(
  (select count(*)::int from public.profiles),
  3,
  'carol sieht die Profile ihrer Gruppenmitglieder (inkl. eigenem)'
);
-- 14
select is((select count(*)::int from public.group_invites), 0, 'Member sehen keine Einladungen');

select pg_temp.login('00000000-0000-0000-0000-00000000000e');
-- 15
select is((select count(*)::int from public.groups), 0, 'eve ohne Gruppe sieht keine Gruppen');
-- 16
select is((select count(*)::int from public.profiles), 1, 'eve sieht nur ihr eigenes Profil');

-- ---------------------------------------------------------------------------
-- Direktes Schreiben in group_members/groups ist verboten
-- ---------------------------------------------------------------------------
-- 17
select throws_ok(
  format($$insert into public.group_members (group_id, user_id, role) values (%L, %L, 'owner')$$,
         (select value from ids where key = 'group_a'), '00000000-0000-0000-0000-00000000000e'),
  '42501',
  null,
  'eve kann sich nicht direkt in eine fremde Gruppe eintragen'
);
-- 18
select throws_ok(
  $$insert into public.groups (name) values ('Hack')$$,
  '42501',
  null,
  'Gruppen können nicht direkt per INSERT angelegt werden'
);

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
-- 19
select throws_ok(
  format($$update public.group_members set role = 'owner' where group_id = %L and user_id = %L$$,
         (select value from ids where key = 'group_a'), '00000000-0000-0000-0000-00000000000c'),
  '42501',
  null,
  'Member kann die eigene Rolle nicht direkt ändern'
);

-- 20
select throws_ok(
  format($$select public.set_group_member_role(%L, %L, 'admin')$$,
         (select value from ids where key = 'group_a'), '00000000-0000-0000-0000-00000000000c'),
  '42501',
  'not_authorized',
  'Member kann sich nicht per Funktion zum Admin machen'
);

-- 21
select throws_ok(
  format($$select * from public.create_group_invite(%L)$$, (select value from ids where key = 'group_a')),
  '42501',
  'not_authorized',
  'Member kann keine Einladungen erzeugen'
);

-- 22 Update der Gruppe durch Member wirkt nicht (RLS filtert)
update public.groups set name = 'Gekapert' where id = (select value::uuid from ids where key = 'group_a');
select pg_temp.as_admin();
select is(
  (select name from public.groups where id = (select value::uuid from ids where key = 'group_a')),
  'Gruppe A',
  'Member kann die Gruppe nicht umbenennen'
);

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
-- 23 Admin darf die Gruppe nicht bearbeiten (nur Owner)
update public.groups set name = 'Admin-Name' where id = (select value::uuid from ids where key = 'group_a');
select pg_temp.as_admin();
select is(
  (select name from public.groups where id = (select value::uuid from ids where key = 'group_a')),
  'Gruppe A',
  'Admin kann die Gruppe nicht umbenennen'
);

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update public.groups set name = 'Gruppe A neu' where id = (select value::uuid from ids where key = 'group_a');
-- 24
select is(
  (select name from public.groups where id = (select value::uuid from ids where key = 'group_a')),
  'Gruppe A neu',
  'Owner kann die Gruppe umbenennen'
);

-- ---------------------------------------------------------------------------
-- Einladungen: Admin-Rechte, Ablauf, Widerruf, Nutzungslimit, Drosselung
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
insert into ids select 'invite_admin', code from public.create_group_invite(
  (select value::uuid from ids where key = 'group_a'), 1, 1);
-- 25
select is((select count(*)::int from public.group_invites), 2, 'Admin sieht die Einladungen der Gruppe');
-- 26
select throws_ok(
  $$select code_hash from public.group_invites$$,
  '42501',
  null,
  'Code-Hashes sind für Clients nicht lesbar'
);

-- Owner entzieht Admins das Recht zur Mitgliederverwaltung
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update public.groups set admins_can_manage_members = false
where id = (select value::uuid from ids where key = 'group_a');

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
-- 27
select throws_ok(
  format($$select * from public.create_group_invite(%L)$$, (select value from ids where key = 'group_a')),
  '42501',
  'not_authorized',
  'Admin ohne Freigabe kann keine Einladungen erzeugen'
);
-- 28
select is((select count(*)::int from public.group_invites), 0, 'Admin ohne Freigabe sieht keine Einladungen');

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update public.groups set admins_can_manage_members = true
where id = (select value::uuid from ids where key = 'group_a');

-- Nutzungslimit 1: eve löst ein, danach ist der Code verbraucht
select pg_temp.login('00000000-0000-0000-0000-00000000000e');
-- 29
select is(
  public.redeem_group_invite((select value from ids where key = 'invite_admin')),
  (select value::uuid from ids where key = 'group_a'),
  'eve tritt mit Einmal-Code bei'
);
-- 30
select is(
  (select role::text from public.group_members
   where user_id = '00000000-0000-0000-0000-00000000000e'),
  'member',
  'Per Einladung beigetretene Benutzer erhalten die Rolle member'
);
select public.leave_group((select value::uuid from ids where key = 'group_a'));

-- 31
select is(
  public.redeem_group_invite((select value from ids where key = 'invite_admin')),
  null,
  'Verbrauchter Einmal-Code wird abgelehnt'
);

-- Abgelaufener Code
select pg_temp.as_admin();
update public.group_invites set created_at = now() - interval '3 hours', expires_at = now() - interval '1 hour'
where code_hash = private.hash_invite_code((select value from ids where key = 'invite_a'));
select pg_temp.login('00000000-0000-0000-0000-00000000000e');
-- 32
select is(
  public.redeem_group_invite((select value from ids where key = 'invite_a')),
  null,
  'Abgelaufener Code wird abgelehnt'
);

-- Widerrufener Code
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into ids select 'invite_revoked', code from public.create_group_invite(
  (select value::uuid from ids where key = 'group_a'), 24, null);
select public.revoke_group_invite(
  (select id from public.group_invites
   where revoked_at is null and expires_at > now() and max_uses is null
   order by created_at desc limit 1));
select pg_temp.login('00000000-0000-0000-0000-00000000000e');
-- 33
select is(
  public.redeem_group_invite((select value from ids where key = 'invite_revoked')),
  null,
  'Widerrufener Code wird abgelehnt'
);

-- Nicht-Verwalter kann nicht widerrufen
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
-- 34
select throws_ok(
  format($$select public.revoke_group_invite(%L)$$,
    (select id from public.group_invites limit 1)),
  '42501',
  'not_authorized',
  'Fremde können Einladungen nicht widerrufen'
);

-- Drosselung: nach 10 Fehlversuchen gesperrt
select pg_temp.login('00000000-0000-0000-0000-00000000000e');
select public.redeem_group_invite('XXXX-XXXX-XXX' || g) from generate_series(1, 7) g;
-- 35
select throws_ok(
  $$select public.redeem_group_invite('AAAA-BBBB-CCCC')$$,
  '54000',
  'too_many_attempts',
  'Nach 10 Fehlversuchen werden weitere Versuche blockiert'
);
-- 36
select throws_ok(
  $$select * from public.group_invite_attempts$$,
  '42501',
  null,
  'Fehlversuchsprotokoll ist für Clients nicht lesbar'
);

-- ---------------------------------------------------------------------------
-- Reviere
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into public.reviere (name, description, group_id, created_by)
values ('Revier Nord', 'Hochwald', (select value::uuid from ids where key = 'group_a'),
        '00000000-0000-0000-0000-00000000000a');
insert into ids select 'revier_a', id::text from public.reviere where name = 'Revier Nord';

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
-- 37
select lives_ok(
  format($$update public.reviere set description = 'Vom Admin bearbeitet' where id = %L$$,
         (select value from ids where key = 'revier_a')),
  'Admin darf Revierinformationen bearbeiten'
);
-- 38
select lives_ok(
  format($$insert into public.reviere (name, group_id, created_by) values ('Revier Süd', %L, %L)$$,
         (select value from ids where key = 'group_a'), '00000000-0000-0000-0000-00000000000b'),
  'Admin darf Reviere anlegen'
);

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
-- 39
select is((select count(*)::int from public.reviere), 2, 'Member sieht die Reviere seiner Gruppe');
-- 40
select throws_ok(
  format($$insert into public.reviere (name, group_id, created_by) values ('Member-Revier', %L, %L)$$,
         (select value from ids where key = 'group_a'), '00000000-0000-0000-0000-00000000000c'),
  '42501',
  null,
  'Member darf keine Reviere anlegen'
);
update public.reviere set name = 'Member-Name' where id = (select value::uuid from ids where key = 'revier_a');
-- 41
select is(
  (select name from public.reviere where id = (select value::uuid from ids where key = 'revier_a')),
  'Revier Nord',
  'Member darf Reviere nicht bearbeiten'
);

select pg_temp.login('00000000-0000-0000-0000-00000000000d');
-- 42
select is((select count(*)::int from public.reviere), 0, 'Fremde Gruppen sehen keine Reviere');
-- 43
select throws_ok(
  format($$insert into public.reviere (name, group_id, created_by) values ('Fremd', %L, %L)$$,
         (select value from ids where key = 'group_a'), '00000000-0000-0000-0000-00000000000d'),
  '42501',
  null,
  'Fremde können keine Reviere in Gruppe A anlegen'
);
-- 44 Revier kann nicht in eine andere Gruppe verschoben werden (Spaltenrecht)
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select throws_ok(
  format($$update public.reviere set group_id = %L where id = %L$$,
         (select value from ids where key = 'group_b'), (select value from ids where key = 'revier_a')),
  '42501',
  null,
  'group_id eines Reviers kann nicht geändert werden'
);

select pg_temp.logout_to_anon();
-- 45
select throws_ok(
  $$select * from public.reviere$$,
  '42501',
  null,
  'Nicht angemeldete Benutzer haben keinen Zugriff auf Reviere'
);
-- 46
select throws_ok(
  $$select public.redeem_group_invite('AAAA-BBBB-CCCC')$$,
  '42501',
  null,
  'Nicht angemeldete Benutzer können keine Einladungen einlösen'
);

-- ---------------------------------------------------------------------------
-- Wegpunkte, Standorte, Nachrichten
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
-- 47
select lives_ok(
  format($$insert into public.waypoints (revier_id, created_by, name, category, latitude, longitude)
           values (%L, %L, 'Hochsitz 1', 'hochsitz', 51.1, 10.2)$$,
         (select value from ids where key = 'revier_a'), '00000000-0000-0000-0000-00000000000b'),
  'Admin darf Wegpunkte anlegen'
);
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
-- 48
select is((select count(*)::int from public.waypoints), 1, 'Member sieht Wegpunkte');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
-- 49
select is((select count(*)::int from public.waypoints), 0, 'Fremde sehen keine Wegpunkte');

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
insert into public.locations (user_id, group_id, latitude, longitude, accuracy)
values ('00000000-0000-0000-0000-00000000000c', (select value::uuid from ids where key = 'group_a'), 51.0, 10.0, 5);
-- 50
select is((select count(*)::int from public.locations), 1, 'Benutzer sieht den eigenen Standort');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
-- 51
select is((select count(*)::int from public.locations), 0,
  'Standorte anderer sind in Phase 1 nicht lesbar – auch nicht für den Owner');
-- 52
select throws_ok(
  format($$insert into public.locations (user_id, group_id, latitude, longitude) values (%L, %L, 1, 1)$$,
         '00000000-0000-0000-0000-00000000000c', (select value from ids where key = 'group_a')),
  '42501',
  null,
  'Standorte können nicht für andere Benutzer geschrieben werden'
);

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
insert into public.messages (group_id, sender_id, content)
values ((select value::uuid from ids where key = 'group_a'), '00000000-0000-0000-0000-00000000000c', 'Waidmannsheil');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
-- 53
select is((select count(*)::int from public.messages), 1, 'Gruppenmitglieder lesen Nachrichten');
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
-- 54
select is((select count(*)::int from public.messages), 0, 'Fremde lesen keine Nachrichten');

-- ---------------------------------------------------------------------------
-- Mitglieder entfernen, Gruppe verlassen
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
-- 55
select throws_ok(
  format($$select public.leave_group(%L)$$, (select value from ids where key = 'group_a')),
  '23514',
  'last_owner',
  'Der letzte Owner kann die Gruppe nicht verlassen'
);

select pg_temp.login('00000000-0000-0000-0000-00000000000b');
-- 56
select throws_ok(
  format($$select public.remove_group_member(%L, %L)$$,
         (select value from ids where key = 'group_a'), '00000000-0000-0000-0000-00000000000a'),
  '42501',
  'not_authorized',
  'Admin kann den Owner nicht entfernen'
);
select public.remove_group_member(
  (select value::uuid from ids where key = 'group_a'), '00000000-0000-0000-0000-00000000000c');
-- 57
select is(
  (select count(*)::int from public.group_members where user_id = '00000000-0000-0000-0000-00000000000c'),
  0,
  'Admin mit Freigabe kann Member entfernen'
);

select * from finish();
rollback;
