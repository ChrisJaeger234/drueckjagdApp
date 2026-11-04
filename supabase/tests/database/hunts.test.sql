-- =============================================================================
-- pgTAP-Tests für Phase 2: PostGIS-Geometrien (0009) und Jagden (0010)
-- Ausführen: supabase test db
--
-- Personen:  d1 Owner · d2 Admin · d3 Mitglied · d4 Mitglied (wird Jagdleiter)
--            d6 Mitglied (wird Ansteller) · d7 Mitglied · d5 Außenstehender
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(57);

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

create or replace function pg_temp.u(p text) returns uuid
language sql immutable as $$ select ('00000000-0000-0000-0000-0000000000' || p)::uuid $$;

-- Gemerkte IDs
create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;
create or replace function pg_temp.id(p text) returns uuid
language sql stable as $$ select id from ids where name = p $$;

-- Zählt die von einer DML-Anweisung betroffenen Zeilen (für „0 Zeilen“-Prüfungen).
create or replace function pg_temp.affected(p_sql text) returns integer
language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

insert into auth.users (id, email, aud, role)
select pg_temp.u(x), x || '@hunt.test', 'authenticated', 'authenticated'
from unnest(array['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7']) as x;

-- Gruppe G (d1 Owner, d2 Admin, d3/d4/d6/d7 Mitglieder)
select pg_temp.login(pg_temp.u('d1'));
insert into ids select 'G', id from public.create_group('Hegering Nord');
insert into ids select 'code', null;
create temp table codes as
  select code from public.create_group_invite(pg_temp.id('G'), 24, null);
grant select on codes to authenticated;

select pg_temp.login(pg_temp.u('d2')); select public.redeem_group_invite((select code from codes));
select pg_temp.login(pg_temp.u('d3')); select public.redeem_group_invite((select code from codes));
select pg_temp.login(pg_temp.u('d4')); select public.redeem_group_invite((select code from codes));
select pg_temp.login(pg_temp.u('d6')); select public.redeem_group_invite((select code from codes));
select pg_temp.login(pg_temp.u('d7')); select public.redeem_group_invite((select code from codes));
select pg_temp.login(pg_temp.u('d1'));
select public.set_group_member_role(pg_temp.id('G'), pg_temp.u('d2'), 'admin');

with t as (
    insert into public.reviere (group_id, created_by, name)
    values (pg_temp.id('G'), pg_temp.u('d1'), 'Revier Eichenhain') returning id
)
insert into ids select 'R', id from t;
with t as (
    insert into public.waypoints (revier_id, name, category, latitude, longitude)
    values (pg_temp.id('R'), 'Bock am Bach', 'drueckjagdbock', 51.505, 9.505) returning id
)
insert into ids select 'W', id from t;

-- Fremde Gruppe X von d5 mit Revier und Einrichtung
select pg_temp.login(pg_temp.u('d5'));
insert into ids select 'X', id from public.create_group('Fremde Gruppe');
with t as (
    insert into public.reviere (group_id, created_by, name)
    values (pg_temp.id('X'), pg_temp.u('d5'), 'Fremdrevier') returning id
)
insert into ids select 'RX', id from t;
with t as (
    insert into public.waypoints (revier_id, name, latitude, longitude)
    values (pg_temp.id('RX'), 'Fremder Sitz', 50.0, 8.0) returning id
)
insert into ids select 'WX', id from t;

-- =============================================================================
-- Geometrien (0009)
-- =============================================================================
select pg_temp.login(pg_temp.u('d1'));
with t as (
    insert into public.revier_boundaries (revier_id, boundary_data)
    values (pg_temp.id('R'),
      '{"type":"Polygon","coordinates":[[[9.5,51.5],[9.51,51.5],[9.51,51.51],[9.5,51.51],[9.5,51.5]]]}')
    returning id
)
insert into ids select 'B', id from t;

-- 1
select is(
  (select extensions.geometrytype(geom) || ':' || extensions.st_srid(geom)
     from public.revier_boundaries where id = pg_temp.id('B')),
  'MULTIPOLYGON:4326',
  'Grenze als Polygon → geom ist MultiPolygon in WGS84'
);

-- 2
select is(
  (select boundary_data ->> 'type' from public.revier_boundaries where id = pg_temp.id('B')),
  'MultiPolygon',
  'boundary_data wird als GeoJSON-MultiPolygon normalisiert'
);

-- 3
select is(
  (select extensions.geometrytype(private.geojson_to_multipolygon(
     '{"type":"Feature","properties":{"name":"Teil"},"geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}}'))),
  'MULTIPOLYGON',
  'GeoJSON-Feature wird akzeptiert'
);

-- 4
select is(
  (select extensions.st_numgeometries(private.geojson_to_multipolygon(
     '{"type":"FeatureCollection","features":[
        {"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}},
        {"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[5,5],[6,5],[6,6],[5,5]]]}},
        {"type":"Feature","geometry":{"type":"Point","coordinates":[3,3]}}]}'))),
  2,
  'FeatureCollection (z. B. KML-Import): Polygone werden vereinigt, Punkte ignoriert'
);

-- 5
select throws_ok(
  format($$insert into public.revier_boundaries (revier_id, boundary_data) values (%L, '{"type":"Point","coordinates":[9.5,51.5]}')$$,
         pg_temp.id('R')),
  '22023', 'invalid_boundary',
  'Punkt als Reviergrenze wird abgelehnt'
);

-- 6
select throws_ok(
  format($$insert into public.revier_boundaries (revier_id, boundary_data) values (%L, '{"type":"Polygon","coordinates":"kaputt"}')$$,
         pg_temp.id('R')),
  '22023', 'invalid_boundary',
  'Kaputtes GeoJSON wird abgelehnt'
);

-- 7
select throws_ok(
  format($$insert into public.revier_boundaries (revier_id, boundary_data) values (%L, '{"type":"Polygon","coordinates":[[[0,0],[500,0],[500,1],[0,0]]]}')$$,
         pg_temp.id('R')),
  '22023', 'invalid_boundary',
  'Koordinaten außerhalb von WGS84 werden abgelehnt'
);

-- 8
select ok(
  (select extensions.st_isvalid(private.geojson_to_multipolygon(
     '{"type":"Polygon","coordinates":[[[0,0],[2,2],[2,0],[0,2],[0,0]]]}'))),
  'Selbstüberschneidendes Polygon („Schleife“) wird repariert'
);

-- 9
select is(
  (select round(extensions.st_y(geom::extensions.geometry)::numeric, 3)
     from public.waypoints where id = pg_temp.id('W')),
  51.505::numeric,
  'Wegpunkt erhält automatisch eine Geografie-Spalte'
);

-- 10
select ok(
  (select extensions.st_covers(b.geom, w.geom::extensions.geometry)
     from public.revier_boundaries b, public.waypoints w
    where b.id = pg_temp.id('B') and w.id = pg_temp.id('W')),
  'Räumliche Abfrage: Einrichtung liegt im Revier'
);

-- 11
select throws_ok(
  format($$update public.revier_boundaries set geom = null where id = %L$$, pg_temp.id('B')),
  '42501', null,
  'geom ist für Clients nicht direkt änderbar'
);

-- =============================================================================
-- Jagd anlegen
-- =============================================================================

-- 12
select pg_temp.login(pg_temp.u('d3'));
select throws_ok(
  format($$insert into public.hunts (group_id, title, starts_at) values (%L, 'Mitgliederjagd', now() + interval '7 days')$$,
         pg_temp.id('G')),
  '42501', null,
  'Einfaches Mitglied kann keine Jagd anlegen'
);

-- 13
select pg_temp.login(pg_temp.u('d2'));
with t as (
    insert into public.hunts (group_id, revier_id, title, starts_at, game_release, safety_notes)
    values (pg_temp.id('G'), pg_temp.id('R'), 'Drückjagd Eichenhain', now() + interval '7 days',
            'Schwarzwild, Rehwild weiblich', 'Signalkleidung Pflicht')
    returning id
)
insert into ids select 'J', id from t;
select isnt(pg_temp.id('J'), null, 'Admin legt eine Jagd mit Revier an');

-- 14
select is(
  (select role::text from public.hunt_participants where hunt_id = pg_temp.id('J') and user_id = pg_temp.u('d2')),
  'jagdleiter',
  'Wer die Jagd anlegt, ist automatisch Jagdleiter'
);

-- 15
select throws_ok(
  format($$insert into public.hunts (group_id, revier_id, title, starts_at) values (%L, %L, 'Falsches Revier', now())$$,
         pg_temp.id('G'), pg_temp.id('RX')),
  '23503', null,
  'Revier einer anderen Gruppe kann nicht verwendet werden'
);

-- 16
select throws_ok(
  format($$insert into public.hunts (group_id, title, starts_at, created_by) values (%L, 'Fälschung', now(), %L)$$,
         pg_temp.id('G'), pg_temp.u('d1')),
  '42501', null,
  'created_by kann nicht gefälscht werden'
);

-- 17
select pg_temp.login(pg_temp.u('d5'));
select is((select count(*)::int from public.hunts where id = pg_temp.id('J')), 0,
  'Außenstehender sieht die Jagd nicht');

-- 18
select pg_temp.login(pg_temp.u('d3'));
select is((select count(*)::int from public.hunts where id = pg_temp.id('J')), 1,
  'Gruppenmitglied sieht die Jagd');

-- 19
select is(
  pg_temp.affected(format($$update public.hunts set title = 'Gekapert' where id = %L$$, pg_temp.id('J'))),
  0,
  'Einfaches Mitglied kann die Jagd nicht bearbeiten'
);

-- 20
select throws_ok(
  format($$update public.hunts set group_id = %L where id = %L$$, pg_temp.id('X'), pg_temp.id('J')),
  '42501', null,
  'Jagd kann nicht in eine andere Gruppe verschoben werden'
);

-- =============================================================================
-- Teilnehmer, Jagdleitung
-- =============================================================================

-- 21: Owner macht d4 zum Jagdleiter
select pg_temp.login(pg_temp.u('d1'));
select lives_ok(
  format($$insert into public.hunt_participants (hunt_id, user_id, role) values (%L, %L, 'jagdleiter')$$,
         pg_temp.id('J'), pg_temp.u('d4')),
  'Owner trägt ein Mitglied als Jagdleiter ein'
);

-- 22
select throws_ok(
  format($$insert into public.hunt_participants (hunt_id, user_id) values (%L, %L)$$,
         pg_temp.id('J'), pg_temp.u('d5')),
  '23514', 'not_a_group_member',
  'Außenstehende können auch von der Jagdleitung nicht eingetragen werden'
);

-- 23: Jagdleiter (ohne Gruppen-Adminrechte) bearbeitet die Jagd
select pg_temp.login(pg_temp.u('d4'));
select is(
  pg_temp.affected(format($$update public.hunts set status = 'laufend' where id = %L$$, pg_temp.id('J'))),
  1,
  'Jagdleiter darf die Jagd bearbeiten (Status laufend)'
);

-- 24: Zone anlegen
with t as (
    insert into public.hunt_zones (hunt_id, name, kind, color, boundary_data)
    values (pg_temp.id('J'), 'Treiben 1', 'treiben', '#2E7D32',
      '{"type":"Polygon","coordinates":[[[9.5,51.5],[9.505,51.5],[9.505,51.505],[9.5,51.505],[9.5,51.5]]]}')
    returning id
)
insert into ids select 'Z', id from t;
select is(
  (select extensions.geometrytype(geom) from public.hunt_zones where id = pg_temp.id('Z')),
  'MULTIPOLYGON',
  'Jagdleiter legt eine Treiben-Zone an, Geometrie wird gepflegt'
);

-- 25: Stand mit Einrichtung
with t as (
    insert into public.hunt_stands (hunt_id, label, waypoint_id, zone_id, latitude, longitude, description)
    values (pg_temp.id('J'), 'Stand 1', pg_temp.id('W'), pg_temp.id('Z'), 51.505, 9.505, 'Schussrichtung Nord–Ost')
    returning id
)
insert into ids select 'S1', id from t;
select isnt(pg_temp.id('S1'), null, 'Jagdleiter legt einen Stand an einer Einrichtung an');

-- 26
select throws_ok(
  format($$insert into public.hunt_stands (hunt_id, label, waypoint_id, latitude, longitude) values (%L, 'Stand X', %L, 50, 8)$$,
         pg_temp.id('J'), pg_temp.id('WX')),
  '23514', 'waypoint_not_in_group',
  'Einrichtung einer fremden Gruppe kann nicht als Stand verwendet werden'
);

-- 27
select throws_ok(
  format($$insert into public.hunt_stands (hunt_id, label, latitude, longitude) values (%L, ' stand 1 ', 51, 9)$$,
         pg_temp.id('J')),
  '23505', null,
  'Standbezeichnung ist je Jagd eindeutig'
);

-- 28
select pg_temp.login(pg_temp.u('d3'));
select throws_ok(
  format($$insert into public.hunt_zones (hunt_id, name, boundary_data) values (%L, 'Meine Zone', '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}')$$,
         pg_temp.id('J')),
  '42501', null,
  'Einfaches Mitglied kann keine Zone anlegen'
);

-- 29
select throws_ok(
  format($$insert into public.hunt_stands (hunt_id, label, latitude, longitude) values (%L, 'Mein Stand', 51, 9)$$,
         pg_temp.id('J')),
  '42501', null,
  'Einfaches Mitglied kann keinen Stand anlegen'
);

-- 30: Selbst eintragen
select lives_ok(
  format($$insert into public.hunt_participants (hunt_id, role) values (%L, 'schuetze')$$, pg_temp.id('J')),
  'Mitglied trägt sich selbst als Schütze ein'
);

-- 31
select throws_ok(
  format($$update public.hunt_participants set role = 'jagdleiter' where hunt_id = %L and user_id = %L$$,
         pg_temp.id('J'), pg_temp.u('d3')),
  '42501', 'not_authorized',
  'Mitglied kann sich nicht selbst zum Jagdleiter machen'
);

-- 32
select throws_ok(
  format($$update public.hunt_participants set stand_id = %L where hunt_id = %L and user_id = %L$$,
         pg_temp.id('S1'), pg_temp.id('J'), pg_temp.u('d3')),
  '42501', 'not_authorized',
  'Mitglied kann sich nicht selbst einen Stand zuteilen'
);

-- 33
select lives_ok(
  format($$update public.hunt_participants set role = 'hundefuehrer', note = 'mit Terrier' where hunt_id = %L and user_id = %L$$,
         pg_temp.id('J'), pg_temp.u('d3')),
  'Mitglied ändert die eigene Rolle (Hundeführer) und Notiz'
);

-- 34
select throws_ok(
  format($$insert into public.hunt_participants (hunt_id, user_id) values (%L, %L)$$,
         pg_temp.id('J'), pg_temp.u('d7')),
  '42501', null,
  'Mitglied kann keine anderen Personen eintragen'
);

-- 35: Jagdleiter teilt den Stand zu
select pg_temp.login(pg_temp.u('d4'));
select is(
  pg_temp.affected(format($$update public.hunt_participants set role = 'schuetze', stand_id = %L where hunt_id = %L and user_id = %L$$,
         pg_temp.id('S1'), pg_temp.id('J'), pg_temp.u('d3'))),
  1,
  'Jagdleiter teilt dem Schützen einen Stand zu'
);

-- 36: Stand aus einer anderen Jagd
select pg_temp.login(pg_temp.u('d1'));
with t as (
    insert into public.hunts (group_id, title, starts_at) values (pg_temp.id('G'), 'Zweite Jagd', now() + interval '30 days')
    returning id
)
insert into ids select 'J2', id from t;
with t as (
    insert into public.hunt_stands (hunt_id, label, latitude, longitude) values (pg_temp.id('J2'), 'Stand A', 51, 9)
    returning id
)
insert into ids select 'S2', id from t;
select throws_ok(
  format($$update public.hunt_participants set stand_id = %L where hunt_id = %L and user_id = %L$$,
         pg_temp.id('S2'), pg_temp.id('J'), pg_temp.u('d3')),
  '23503', null,
  'Ein Stand einer anderen Jagd kann nicht zugeteilt werden'
);

-- 37: Ansteller darf keine Jagdleiter ernennen, aber Stände zuteilen
select lives_ok(
  format($$insert into public.hunt_participants (hunt_id, user_id, role) values (%L, %L, 'ansteller')$$,
         pg_temp.id('J'), pg_temp.u('d6')),
  'Owner trägt einen Ansteller ein'
);

-- 38
select pg_temp.login(pg_temp.u('d6'));
select throws_ok(
  format($$update public.hunt_participants set role = 'jagdleiter' where hunt_id = %L and user_id = %L$$,
         pg_temp.id('J'), pg_temp.u('d3')),
  '42501', 'not_authorized',
  'Ansteller kann niemanden zum Jagdleiter machen'
);

-- 39
select is(
  pg_temp.affected(format($$update public.hunt_participants set stand_id = null where hunt_id = %L and user_id = %L$$,
         pg_temp.id('J'), pg_temp.u('d3'))),
  1,
  'Ansteller kann Stände zuteilen und zurücknehmen'
);

-- 40: Außenstehender kann sich nicht eintragen
select pg_temp.login(pg_temp.u('d5'));
select throws_ok(
  format($$insert into public.hunt_participants (hunt_id) values (%L)$$, pg_temp.id('J')),
  '42501', null,
  'Außenstehender kann sich nicht selbst eintragen'
);

-- 41: Selbsteintragung gesperrt
select pg_temp.login(pg_temp.u('d1'));
update public.hunts set self_join = false where id = pg_temp.id('J');
select pg_temp.login(pg_temp.u('d7'));
select throws_ok(
  format($$insert into public.hunt_participants (hunt_id) values (%L)$$, pg_temp.id('J')),
  '42501', null,
  'Ohne Selbsteintragung kann sich niemand selbst eintragen'
);

-- 42: beendete Jagd
select pg_temp.login(pg_temp.u('d1'));
update public.hunts set self_join = true, status = 'beendet' where id = pg_temp.id('J');
select pg_temp.login(pg_temp.u('d7'));
select throws_ok(
  format($$insert into public.hunt_participants (hunt_id) values (%L)$$, pg_temp.id('J')),
  '42501', null,
  'In eine beendete Jagd kann man sich nicht mehr eintragen'
);
select pg_temp.login(pg_temp.u('d1'));
update public.hunts set status = 'laufend' where id = pg_temp.id('J');

-- =============================================================================
-- Meldungen
-- =============================================================================

-- 43
select pg_temp.login(pg_temp.u('d3'));
with t as (
    insert into public.hunt_reports (hunt_id, kind, species, stand_id, latitude, longitude, note)
    values (pg_temp.id('J'), 'angeschossen', 'Schwarzwild', pg_temp.id('S1'), 51.5051, 9.5052, 'flüchtig Richtung Bach')
    returning id
)
insert into ids select 'M', id from t;
select is(
  (select reporter_id from public.hunt_reports where id = pg_temp.id('M')),
  pg_temp.u('d3'),
  'Schütze meldet „angeschossen“, Melder wird automatisch gesetzt'
);

-- 44
select throws_ok(
  format($$insert into public.hunt_reports (hunt_id, kind, reporter_id) values (%L, 'erlegt', %L)$$,
         pg_temp.id('J'), pg_temp.u('d1')),
  '42501', null,
  'Meldung im Namen eines anderen wird abgelehnt'
);

-- 45
select pg_temp.login(pg_temp.u('d5'));
select is((select count(*)::int from public.hunt_reports where hunt_id = pg_temp.id('J')), 0,
  'Außenstehender sieht keine Meldungen');

-- 46
select throws_ok(
  format($$insert into public.hunt_reports (hunt_id, kind) values (%L, 'erlegt')$$, pg_temp.id('J')),
  '42501', null,
  'Außenstehender kann nichts melden'
);

-- 47
select pg_temp.login(pg_temp.u('d7'));
select is(
  pg_temp.affected(format($$update public.hunt_reports set note = 'geändert' where id = %L$$, pg_temp.id('M'))),
  0,
  'Anderes Mitglied kann fremde Meldungen nicht ändern'
);

-- 48
select pg_temp.login(pg_temp.u('d4'));
update public.hunt_reports set resolved_at = now() where id = pg_temp.id('M');
select is(
  (select resolved_by from public.hunt_reports where id = pg_temp.id('M')),
  pg_temp.u('d4'),
  'Jagdleiter meldet die Nachsuche als erledigt, Server setzt resolved_by'
);

-- 49
select throws_ok(
  format($$update public.hunt_reports set resolved_by = %L where id = %L$$, pg_temp.u('d1'), pg_temp.id('M')),
  '42501', null,
  'resolved_by kann nicht direkt gesetzt werden'
);

-- =============================================================================
-- Austragen, Gruppenaustritt, Löschen
-- =============================================================================

-- 50
select pg_temp.login(pg_temp.u('d1'));
select public.remove_group_member(pg_temp.id('G'), pg_temp.u('d6'));
select is(
  (select count(*)::int from public.hunt_participants where user_id = pg_temp.u('d6')),
  0,
  'Wer aus der Gruppe entfernt wird, verliert seine Teilnahmen an deren Jagden'
);

-- 51
select pg_temp.login(pg_temp.u('d4'));
select is(
  pg_temp.affected(format($$delete from public.hunts where id = %L$$, pg_temp.id('J'))),
  0,
  'Jagdleiter ohne Gruppen-Adminrechte kann die Jagd nicht löschen'
);

-- 52
select pg_temp.login(pg_temp.u('d2'));
delete from public.hunts where id = pg_temp.id('J');
select pg_temp.as_admin();
select is(
  (select count(*)::int from public.hunt_reports where hunt_id = pg_temp.id('J'))
  + (select count(*)::int from public.hunt_stands where hunt_id = pg_temp.id('J'))
  + (select count(*)::int from public.hunt_participants where hunt_id = pg_temp.id('J')),
  0,
  'Admin löscht die Jagd, Stände, Teilnehmer und Meldungen werden mitgelöscht'
);

-- =============================================================================
-- Enums: müssen exakt den Dart-Enums entsprechen (test/unit/hunts_test.dart)
-- =============================================================================
-- 53
select enum_has_labels('public', 'waypoint_category', array[
  'hochsitz', 'kanzel', 'drueckjagdbock', 'ansitzleiter', 'kirrung', 'fuetterung', 'salzlecke',
  'suhle', 'wildacker', 'wildkamera', 'weg', 'sammelplatz', 'parkplatz', 'gefahr', 'sonstiges'],
  'waypoint_category in der Reihenfolge der App');
-- 54
select enum_has_labels('public', 'hunt_status', array['geplant', 'laufend', 'beendet', 'abgesagt'],
  'hunt_status entspricht der App');
-- 55
select enum_has_labels('public', 'hunt_role', array[
  'jagdleiter', 'ansteller', 'schuetze', 'treiber', 'hundefuehrer', 'bergung', 'sonstige'],
  'hunt_role entspricht der App');
-- 56
select enum_has_labels('public', 'hunt_zone_kind', array[
  'treiben', 'sicherheitszone', 'sperrzone', 'sammelplatz', 'sonstiges'],
  'hunt_zone_kind entspricht der App');
-- 57
select enum_has_labels('public', 'hunt_report_kind', array[
  'erlegt', 'angeschossen', 'ueberschossen', 'anblick', 'sonstiges'],
  'hunt_report_kind entspricht der App');

select * from finish();
rollback;
