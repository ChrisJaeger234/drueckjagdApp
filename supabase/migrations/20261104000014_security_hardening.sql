-- =============================================================================
-- 0014 – Sicherheitsprüfung (Phase 10): kleine Härtung, rein additiv.
--
-- * public.set_updated_at() ist eine reine Triggerfunktion. Supabase gibt neuen
--   Funktionen im Schema public standardmäßig EXECUTE für anon/authenticated;
--   direkt aufrufen muss sie niemand. Trigger laufen davon unabhängig weiter.
-- Daten und Tabellen bleiben unverändert.
-- =============================================================================

revoke execute on function public.set_updated_at() from public, anon, authenticated;
