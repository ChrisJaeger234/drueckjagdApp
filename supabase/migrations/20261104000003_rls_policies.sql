-- =============================================================================
-- 0003 – Row Level Security, Rechte und Berechtigungs-Hilfsfunktionen
--
-- Grundsatz: Alles ist verboten, was nicht ausdrücklich erlaubt ist.
--   * RLS ist auf allen Tabellen aktiv.
--   * Die Rolle "anon" (nicht angemeldet) erhält keinerlei Tabellenrechte.
--   * Spaltenrechte verhindern, dass Fremdschlüssel (z. B. group_id) per UPDATE
--     umgehängt werden.
--   * Mitgliedschaften werden ausschließlich über SECURITY-DEFINER-Funktionen
--     geschrieben (siehe 0004).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Privates Schema für Hilfsfunktionen (wird von PostgREST nicht exponiert)
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Ist der aktuelle Benutzer Mitglied der Gruppe?
-- SECURITY DEFINER, damit Policies auf group_members nicht rekursiv werden.
create or replace function private.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = (select auth.uid())
  );
$$;

-- Hat der aktuelle Benutzer in der Gruppe eine der Rollen?
create or replace function private.has_group_role(p_group_id uuid, p_roles public.group_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = (select auth.uid())
      and gm.role = any (p_roles)
  );
$$;

-- Darf der aktuelle Benutzer Mitglieder verwalten (einladen/entfernen)?
-- Owner immer, Admins nur wenn der Owner es erlaubt.
create or replace function private.can_manage_members(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.group_id = p_group_id
      and gm.user_id = (select auth.uid())
      and (
        gm.role = 'owner'
        or (gm.role = 'admin' and g.admins_can_manage_members)
      )
  );
$$;

-- Teilt der aktuelle Benutzer mindestens eine Gruppe mit p_user_id?
create or replace function private.shares_group_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_user_id
  );
$$;

-- Gruppe eines Reviers (für Policies auf Kind-Tabellen).
create or replace function private.revier_group_id(p_revier_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.group_id from public.reviere r where r.id = p_revier_id;
$$;

-- Wandelt Text sicher in eine UUID um (NULL bei ungültigem Wert).
create or replace function private.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- -----------------------------------------------------------------------------
-- Tabellenrechte: anon bekommt nichts, authenticated nur das Nötige
-- -----------------------------------------------------------------------------
revoke all on
  public.profiles,
  public.groups,
  public.group_members,
  public.group_invites,
  public.group_invite_attempts,
  public.reviere,
  public.revier_boundaries,
  public.waypoints,
  public.locations,
  public.messages
from anon, authenticated;

grant select, insert on public.profiles to authenticated;
grant update (username, display_name, avatar_url) on public.profiles to authenticated;

grant select, delete on public.groups to authenticated;
grant update (name, description, admins_can_manage_members) on public.groups to authenticated;

grant select on public.group_members to authenticated;

-- Der Hash wird bewusst nicht lesbar gemacht.
grant select (id, group_id, created_by, created_at, expires_at, max_uses, use_count, revoked_at)
  on public.group_invites to authenticated;

-- group_invite_attempts: kein Clientzugriff.

grant select, insert, delete on public.reviere to authenticated;
grant update (name, description) on public.reviere to authenticated;

grant select, insert, delete on public.revier_boundaries to authenticated;
grant update (boundary_data) on public.revier_boundaries to authenticated;

grant select, insert, delete on public.waypoints to authenticated;
grant update (name, description, category, latitude, longitude) on public.waypoints to authenticated;

grant select, insert, delete on public.locations to authenticated;

grant select, insert, delete on public.messages to authenticated;

-- -----------------------------------------------------------------------------
-- RLS aktivieren
-- -----------------------------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.groups                enable row level security;
alter table public.group_members         enable row level security;
alter table public.group_invites         enable row level security;
alter table public.group_invite_attempts enable row level security;
alter table public.reviere               enable row level security;
alter table public.revier_boundaries     enable row level security;
alter table public.waypoints             enable row level security;
alter table public.locations             enable row level security;
alter table public.messages              enable row level security;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create policy "profiles: eigenes Profil oder Gruppenmitglieder lesen"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_group_with(id));

create policy "profiles: nur eigenes Profil anlegen"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

create policy "profiles: nur eigenes Profil bearbeiten"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- groups (Anlage nur über public.create_group)
-- -----------------------------------------------------------------------------
create policy "groups: Mitglieder lesen"
  on public.groups for select to authenticated
  using (private.is_group_member(id));

create policy "groups: Owner bearbeiten"
  on public.groups for update to authenticated
  using (private.has_group_role(id, array['owner']::public.group_role[]))
  with check (private.has_group_role(id, array['owner']::public.group_role[]));

create policy "groups: Owner löschen"
  on public.groups for delete to authenticated
  using (private.has_group_role(id, array['owner']::public.group_role[]));

-- -----------------------------------------------------------------------------
-- group_members (Schreiben nur über Funktionen)
-- -----------------------------------------------------------------------------
create policy "group_members: Mitglieder derselben Gruppe lesen"
  on public.group_members for select to authenticated
  using (private.is_group_member(group_id));

-- -----------------------------------------------------------------------------
-- group_invites (Anlegen/Widerrufen nur über Funktionen)
-- -----------------------------------------------------------------------------
create policy "group_invites: Mitgliederverwalter lesen"
  on public.group_invites for select to authenticated
  using (private.can_manage_members(group_id));

-- group_invite_attempts: RLS aktiv, keine Policy → kein Zugriff.

-- -----------------------------------------------------------------------------
-- reviere
-- -----------------------------------------------------------------------------
create policy "reviere: Gruppenmitglieder lesen"
  on public.reviere for select to authenticated
  using (private.is_group_member(group_id));

create policy "reviere: Owner und Admins anlegen"
  on public.reviere for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.has_group_role(group_id, array['owner', 'admin']::public.group_role[])
  );

create policy "reviere: Owner und Admins bearbeiten"
  on public.reviere for update to authenticated
  using (private.has_group_role(group_id, array['owner', 'admin']::public.group_role[]))
  with check (private.has_group_role(group_id, array['owner', 'admin']::public.group_role[]));

create policy "reviere: Owner löschen"
  on public.reviere for delete to authenticated
  using (private.has_group_role(group_id, array['owner']::public.group_role[]));

-- -----------------------------------------------------------------------------
-- revier_boundaries
-- -----------------------------------------------------------------------------
create policy "revier_boundaries: Gruppenmitglieder lesen"
  on public.revier_boundaries for select to authenticated
  using (private.is_group_member(private.revier_group_id(revier_id)));

create policy "revier_boundaries: Owner und Admins anlegen"
  on public.revier_boundaries for insert to authenticated
  with check (private.has_group_role(private.revier_group_id(revier_id),
                                     array['owner', 'admin']::public.group_role[]));

create policy "revier_boundaries: Owner und Admins bearbeiten"
  on public.revier_boundaries for update to authenticated
  using (private.has_group_role(private.revier_group_id(revier_id),
                                array['owner', 'admin']::public.group_role[]))
  with check (private.has_group_role(private.revier_group_id(revier_id),
                                     array['owner', 'admin']::public.group_role[]));

create policy "revier_boundaries: Owner und Admins löschen"
  on public.revier_boundaries for delete to authenticated
  using (private.has_group_role(private.revier_group_id(revier_id),
                                array['owner', 'admin']::public.group_role[]));

-- -----------------------------------------------------------------------------
-- waypoints
-- -----------------------------------------------------------------------------
create policy "waypoints: Gruppenmitglieder lesen"
  on public.waypoints for select to authenticated
  using (private.is_group_member(private.revier_group_id(revier_id)));

create policy "waypoints: Owner und Admins anlegen"
  on public.waypoints for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.has_group_role(private.revier_group_id(revier_id),
                               array['owner', 'admin']::public.group_role[])
  );

create policy "waypoints: Ersteller, Owner und Admins bearbeiten"
  on public.waypoints for update to authenticated
  using (
    private.is_group_member(private.revier_group_id(revier_id))
    and (
      created_by = (select auth.uid())
      or private.has_group_role(private.revier_group_id(revier_id),
                                array['owner', 'admin']::public.group_role[])
    )
  )
  with check (private.is_group_member(private.revier_group_id(revier_id)));

create policy "waypoints: Ersteller, Owner und Admins löschen"
  on public.waypoints for delete to authenticated
  using (
    private.is_group_member(private.revier_group_id(revier_id))
    and (
      created_by = (select auth.uid())
      or private.has_group_role(private.revier_group_id(revier_id),
                                array['owner', 'admin']::public.group_role[])
    )
  );

-- -----------------------------------------------------------------------------
-- locations (Phase 1: ausschließlich eigene Daten)
-- -----------------------------------------------------------------------------
create policy "locations: nur eigene lesen"
  on public.locations for select to authenticated
  using (user_id = (select auth.uid()));

create policy "locations: nur eigene in eigener Gruppe schreiben"
  on public.locations for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_group_member(group_id));

create policy "locations: nur eigene löschen"
  on public.locations for delete to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- messages
-- -----------------------------------------------------------------------------
create policy "messages: Gruppenmitglieder lesen"
  on public.messages for select to authenticated
  using (private.is_group_member(group_id));

create policy "messages: Gruppenmitglieder schreiben"
  on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and private.is_group_member(group_id));

create policy "messages: eigene löschen"
  on public.messages for delete to authenticated
  using (sender_id = (select auth.uid()));
