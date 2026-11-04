-- =============================================================================
-- 0012 – Gruppenchat (Phase 9)
--
-- Rein additiv; die Tabelle messages und ihre RLS-Regeln (0002/0003) bleiben.
--   * Echtzeit: messages wird für Supabase Realtime freigegeben. Realtime hält
--     sich bei neuen Nachrichten an die RLS-Leseregel (nur Gruppenmitglieder).
--   * Zeitstempel vom Server: created_at kann nicht rückdatiert werden. Die App
--     vergibt die ID selbst, damit eine im Funkloch wiederholte Nachricht nicht
--     doppelt ankommt.
-- =============================================================================

create or replace function private.stamp_message_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

revoke all on function private.stamp_message_created_at() from public, anon, authenticated;

create trigger messages_stamp_created_at
  before insert on public.messages
  for each row execute function private.stamp_message_created_at();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
     ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
