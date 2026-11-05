-- =============================================================================
-- 0015 – Art für Stände einer Jagd
--
-- Stände einer Jagd können jetzt eine Art haben (Hochsitz, Drückjagdbock,
-- Sammelplatz, …), dieselben Werte wie bei den Einrichtungen des Reviers.
-- Wird eine Einrichtung des Reviers als Stand übernommen, gibt die App deren
-- Art als Vorgabe mit. null bedeutet „Stand ohne Angabe“ (alle bisherigen).
--
-- Nur Ergänzungen: neue, leere Spalte und Rechte darauf. Bestehende Daten und
-- die Flutter-App bleiben unverändert.
-- =============================================================================

alter table public.hunt_stands
  add column if not exists category public.waypoint_category;

comment on column public.hunt_stands.category is
  'Art des Standes bzw. Punktes (wie waypoints.category); null = Stand ohne Angabe.';

grant insert (category) on public.hunt_stands to authenticated;
grant update (category) on public.hunt_stands to authenticated;
