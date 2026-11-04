-- =============================================================================
-- 0008 – Weitere Kategorien für jagdliche Einrichtungen
--
-- Eigene Migration, weil neue Enum-Werte erst nach dem Commit der Transaktion
-- verwendet werden dürfen. Bestehende Werte bleiben unverändert; ältere
-- App-Versionen zeigen unbekannte Kategorien als „Sonstiges“ an.
-- =============================================================================

alter type public.waypoint_category add value if not exists 'drueckjagdbock' after 'kanzel';
alter type public.waypoint_category add value if not exists 'ansitzleiter'   after 'drueckjagdbock';
alter type public.waypoint_category add value if not exists 'salzlecke'      after 'fuetterung';
alter type public.waypoint_category add value if not exists 'suhle'          after 'salzlecke';
alter type public.waypoint_category add value if not exists 'wildacker'      after 'suhle';
alter type public.waypoint_category add value if not exists 'sammelplatz'    after 'weg';
alter type public.waypoint_category add value if not exists 'parkplatz'      after 'sammelplatz';
