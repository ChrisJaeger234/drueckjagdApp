-- Phase 10: übergreifende Sicherheitsregeln für alle Tabellen und Funktionen.
begin;
select plan(6);

select is(
  (select coalesce(string_agg(c.relname, ', '), '') from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind in ('r', 'p') and n.nspname = 'public' and not c.relrowsecurity),
  '', 'RLS ist auf allen Tabellen in public aktiv');

select is(
  (select coalesce(string_agg(p.oid::regprocedure::text, ', '), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef
     and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')),
  '', 'Jede SECURITY-DEFINER-Funktion setzt search_path');

select is(
  (select coalesce(string_agg(table_name || ':' || privilege_type, ', '), '') from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'),
  '', 'anon hat keine Tabellenrechte');

select is(
  (select coalesce(string_agg(p.oid::regprocedure::text, ', '), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
  '', 'anon darf keine Funktion in public ausführen');

select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon hat keinen Zugriff auf das Schema private');

select is(
  (select coalesce(string_agg(t, ', '), '') from (
     select table_name::text as t from information_schema.role_table_grants
     where grantee = 'authenticated' and table_schema = 'public' and privilege_type in ('UPDATE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
  ) x),
  '', 'authenticated ändert nur einzelne freigegebene Spalten (keine Tabellenrechte für UPDATE)');

select * from finish();
rollback;
