-- =============================================================================
-- 0017 – Neue Arten für Einrichtungen: Kanzel offen, Fahrbare Kanzel
--
-- Eigene Migration, weil neue Enum-Werte erst nach dem Commit der Transaktion
-- verwendet werden dürfen. Ältere App-Versionen zeigen den Wert als „Sonstiges“.
-- =============================================================================

-- „kanzel“ heißt in der App jetzt „Kanzel geschlossen“, „drueckjagdbock“ heißt
-- „Drückjagdbock ohne Dach“; dafür ist keine Änderung der Datenbank nötig.
alter type public.waypoint_category add value if not exists 'kanzel_offen'    after 'kanzel';
alter type public.waypoint_category add value if not exists 'fahrbare_kanzel' after 'kanzel_offen';
