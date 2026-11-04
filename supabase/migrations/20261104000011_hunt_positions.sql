-- =============================================================================
-- 0011 – Live-Standorte während einer laufenden Jagd (Phase 8)
--
-- Rein additiv: neue Tabelle hunt_positions, neue Hilfsfunktionen, Trigger.
-- Bestehende Tabellen und Daten bleiben unverändert.
--
-- Regeln (Sicherheit zuerst, Datensparsamkeit):
--   * Teilen dürfen nur Teilnehmer mit den Rollen Treiber, Hundeführer,
--     Bergung, Jagdleiter und Ansteller, und nur solange die Jagd läuft.
--     Schützen teilen nicht.
--   * Sehen dürfen die Positionen dieselben Rollen sowie Owner/Admins der
--     Gruppe (Jagdleitung). Schützen sehen nur die eigene Position, die ohnehin
--     nur lokal angezeigt wird.
--   * Je Person und Jagd gibt es genau eine Zeile (letzte Position), keine
--     Bewegungsprotokolle. Endet die Jagd, wird die Rolle gewechselt oder die
--     Teilnahme beendet, wird die Position gelöscht.
--   * Der Zeitstempel kommt vom Server (updated_at), nicht vom Gerät.
-- =============================================================================

create table public.hunt_positions (
  hunt_id     uuid not null references public.hunts (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  latitude    double precision not null,
  longitude   double precision not null,
  accuracy    double precision,
  updated_at  timestamptz not null default now(),

  primary key (hunt_id, user_id),
  constraint hunt_positions_latitude_range check (latitude between -90 and 90),
  constraint hunt_positions_longitude_range check (longitude between -180 and 180),
  constraint hunt_positions_accuracy_positive check (accuracy is null or accuracy >= 0)
);

create index hunt_positions_user_id_idx on public.hunt_positions (user_id);

comment on table public.hunt_positions is
  'Letzte Live-Position je Teilnehmer während einer laufenden Jagd (nur Treiber, Hundeführer, Bergung, Jagdleitung).';

-- Server-Zeit bei jedem Schreiben.
create or replace function private.stamp_hunt_position()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.stamp_hunt_position() from public, anon, authenticated;

create trigger hunt_positions_stamp
  before insert or update on public.hunt_positions
  for each row execute function private.stamp_hunt_position();

-- -----------------------------------------------------------------------------
-- Hilfsfunktionen
-- -----------------------------------------------------------------------------

-- Rollen, die ihren Standort teilen und die Positionen der anderen sehen.
create or replace function private.is_position_sharing_role(p_role public.hunt_role)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_role in ('treiber', 'hundefuehrer', 'bergung', 'jagdleiter', 'ansteller');
$$;

-- Darf der aktuelle Benutzer in dieser Jagd seinen Standort teilen?
create or replace function private.can_share_hunt_position(p_hunt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hunts h
    join public.hunt_participants hp on hp.hunt_id = h.id and hp.user_id = (select auth.uid())
    join public.group_members gm on gm.group_id = h.group_id and gm.user_id = hp.user_id
    where h.id = p_hunt_id
      and h.status = 'laufend'
      and private.is_position_sharing_role(hp.role)
  );
$$;

-- Darf der aktuelle Benutzer die geteilten Positionen dieser Jagd sehen?
create or replace function private.can_view_hunt_positions(p_hunt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hunts h
    join public.group_members gm on gm.group_id = h.group_id and gm.user_id = (select auth.uid())
    where h.id = p_hunt_id
      and h.status = 'laufend'
      and (
        gm.role in ('owner', 'admin')
        or exists (
          select 1 from public.hunt_participants hp
          where hp.hunt_id = h.id
            and hp.user_id = gm.user_id
            and private.is_position_sharing_role(hp.role)
        )
      )
  );
$$;

grant execute on function private.is_position_sharing_role(public.hunt_role) to authenticated;
grant execute on function private.can_share_hunt_position(uuid) to authenticated;
grant execute on function private.can_view_hunt_positions(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Rechte und RLS
-- -----------------------------------------------------------------------------
revoke all on public.hunt_positions from anon, authenticated;
grant select, delete on public.hunt_positions to authenticated;
grant insert (hunt_id, user_id, latitude, longitude, accuracy) on public.hunt_positions to authenticated;
grant update (latitude, longitude, accuracy) on public.hunt_positions to authenticated;

alter table public.hunt_positions enable row level security;

create policy "hunt_positions: eigene oder als Treiber/Jagdleitung lesen"
  on public.hunt_positions for select to authenticated
  using (user_id = (select auth.uid()) or private.can_view_hunt_positions(hunt_id));

create policy "hunt_positions: eigene teilen, solange erlaubt"
  on public.hunt_positions for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_share_hunt_position(hunt_id));

create policy "hunt_positions: eigene aktualisieren, solange erlaubt"
  on public.hunt_positions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.can_share_hunt_position(hunt_id));

create policy "hunt_positions: eigene oder Jagdleitung löschen"
  on public.hunt_positions for delete to authenticated
  using (user_id = (select auth.uid()) or private.can_manage_hunt(hunt_id));

-- -----------------------------------------------------------------------------
-- Schnittstelle für die App (security invoker: es gelten die Regeln oben)
-- -----------------------------------------------------------------------------
create or replace function public.share_hunt_position(
  p_hunt_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy double precision default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.hunt_positions (hunt_id, latitude, longitude, accuracy)
  values (p_hunt_id, p_latitude, p_longitude, p_accuracy)
  on conflict (hunt_id, user_id) do update
    set latitude = excluded.latitude, longitude = excluded.longitude, accuracy = excluded.accuracy;
$$;

create or replace function public.stop_hunt_position(p_hunt_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.hunt_positions where hunt_id = p_hunt_id and user_id = (select auth.uid());
$$;

revoke all on function public.share_hunt_position(uuid, double precision, double precision, double precision) from public, anon;
revoke all on function public.stop_hunt_position(uuid) from public, anon;
grant execute on function public.share_hunt_position(uuid, double precision, double precision, double precision) to authenticated;
grant execute on function public.stop_hunt_position(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Aufräumen: Live-Positionen sind nur während der Jagd sinnvoll.
-- -----------------------------------------------------------------------------
create or replace function private.clear_hunt_positions_on_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'laufend' and old.status = 'laufend' then
    delete from public.hunt_positions where hunt_id = new.id;
  end if;
  return null;
end;
$$;

revoke all on function private.clear_hunt_positions_on_status() from public, anon, authenticated;

create trigger hunts_clear_positions
  after update of status on public.hunts
  for each row execute function private.clear_hunt_positions_on_status();

create or replace function private.clear_hunt_position_on_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.hunt_positions where hunt_id = old.hunt_id and user_id = old.user_id;
  elsif not private.is_position_sharing_role(new.role) then
    delete from public.hunt_positions where hunt_id = new.hunt_id and user_id = new.user_id;
  end if;
  return null;
end;
$$;

revoke all on function private.clear_hunt_position_on_participant() from public, anon, authenticated;

create trigger hunt_participants_clear_position
  after update of role or delete on public.hunt_participants
  for each row execute function private.clear_hunt_position_on_participant();
