-- =============================================================================
-- 0017 – Neue Art für Einrichtungen: Fahrbare Kanzel
--
-- Eigene Migration, weil neue Enum-Werte erst nach dem Commit der Transaktion
-- verwendet werden dürfen. Ältere App-Versionen zeigen den Wert als „Sonstiges“.
-- =============================================================================

alter type public.waypoint_category add value if not exists 'fahrbare_kanzel' after 'kanzel';
