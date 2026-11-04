-- =============================================================================
-- 0001 – Erweiterungen und allgemeine Hilfsfunktionen
-- =============================================================================

-- PostGIS wird bereits aktiviert, damit Phase 2 (Reviergrenzen, räumliche
-- Abfragen) ohne Schema-Umbau darauf aufsetzen kann.
create extension if not exists postgis with schema extensions;

-- pgcrypto: gen_random_bytes() und digest() für Einladungscodes.
create extension if not exists pgcrypto with schema extensions;

-- Setzt updated_at bei jedem UPDATE automatisch.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger-Funktion: aktualisiert updated_at bei jeder Änderung.';
