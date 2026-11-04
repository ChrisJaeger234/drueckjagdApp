-- =============================================================================
-- 0006 – Härtung nach dem Phase-1-Review
--
-- Rein additive Änderungen (keine Tabellen/Spalten/Daten werden entfernt):
--   1. Owner-Prüfungen gegen gleichzeitige Änderungen absichern
--      (zwei Owner stufen sich parallel herab → Gruppe ohne Owner).
--   2. Einladung einlösen: parallele Aufrufe ohne Unique-Fehler, Drosselung
--      pro Benutzer serialisiert, altes Fehlversuchsprotokoll wird aufgeräumt.
--   3. Gruppe bleibt nie ohne Owner, wenn ein Konto gelöscht wird
--      (Nachfolger wird automatisch ernannt, leere Gruppen werden entfernt).
--   4. Standardwerte für created_by / sender_id / user_id = auth.uid().
--   5. Fehlende Indizes auf Fremdschlüsseln (created_by, sender_id).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Owner-Prüfungen serialisieren
--    Alle Funktionen, die die Zahl der Owner verringern können, sperren zuerst
--    die Gruppenzeile. Damit laufen sie je Gruppe nacheinander, und die
--    „letzter Owner“-Prüfung sieht immer den aktuellen Stand.
-- -----------------------------------------------------------------------------
create or replace function private.lock_group(p_group_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select 1 from public.groups g where g.id = p_group_id for update;
$$;

revoke all on function private.lock_group(uuid) from public, anon, authenticated;

create or replace function public.set_group_member_role(
  p_group_id uuid,
  p_user_id  uuid,
  p_role     public.group_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.group_role;
  v_owners  integer;
begin
  -- Erst sperren, dann prüfen: so sieht die Rollenprüfung den Stand nach
  -- einer parallel laufenden Änderung.
  perform private.lock_group(p_group_id);

  if not private.has_group_role(p_group_id, array['owner']::public.group_role[]) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select gm.role into v_current
  from public.group_members gm
  where gm.group_id = p_group_id and gm.user_id = p_user_id
  for update;

  if v_current is null then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;

  if v_current = 'owner' and p_role <> 'owner' then
    select count(*) into v_owners
    from public.group_members gm
    where gm.group_id = p_group_id and gm.role = 'owner';
    if v_owners <= 1 then
      raise exception 'last_owner' using errcode = '23514';
    end if;
  end if;

  update public.group_members
  set role = p_role
  where group_id = p_group_id and user_id = p_user_id;
end;
$$;

create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_target_role public.group_role;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_user_id = v_uid then
    raise exception 'use_leave_group' using errcode = '22023';
  end if;

  perform private.lock_group(p_group_id);

  select gm.role into v_target_role
  from public.group_members gm
  where gm.group_id = p_group_id and gm.user_id = p_user_id;

  if v_target_role is null then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;

  if private.has_group_role(p_group_id, array['owner']::public.group_role[]) then
    null; -- Owner darf alle anderen entfernen.
  elsif v_target_role = 'member' and private.can_manage_members(p_group_id) then
    null; -- Admin mit Freigabe darf einfache Mitglieder entfernen.
  else
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  delete from public.group_members
  where group_id = p_group_id and user_id = p_user_id;
end;
$$;

create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_role   public.group_role;
  v_owners integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  perform private.lock_group(p_group_id);

  select gm.role into v_role
  from public.group_members gm
  where gm.group_id = p_group_id and gm.user_id = v_uid
  for update;

  if v_role is null then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;

  if v_role = 'owner' then
    select count(*) into v_owners
    from public.group_members gm
    where gm.group_id = p_group_id and gm.role = 'owner';
    if v_owners <= 1 then
      raise exception 'last_owner' using errcode = '23514';
    end if;
  end if;

  delete from public.group_members
  where group_id = p_group_id and user_id = v_uid;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Einladung einlösen – robust bei parallelen Aufrufen
-- -----------------------------------------------------------------------------
create or replace function public.redeem_group_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_invite   public.group_invites;
  v_failures integer;
  v_inserted integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Versuche desselben Benutzers nacheinander abarbeiten, damit die
  -- Drosselung nicht durch parallele Anfragen umgangen werden kann.
  perform pg_advisory_xact_lock(hashtextextended('redeem_group_invite:' || v_uid::text, 0));

  -- Protokoll klein halten: Einträge älter als ein Tag werden nicht mehr benötigt.
  delete from public.group_invite_attempts a
  where a.user_id = v_uid
    and a.attempted_at < now() - interval '1 day';

  select count(*) into v_failures
  from public.group_invite_attempts a
  where a.user_id = v_uid
    and a.attempted_at > now() - interval '15 minutes';

  if v_failures >= 10 then
    raise exception 'too_many_attempts' using errcode = '54000';
  end if;

  select * into v_invite
  from public.group_invites gi
  where gi.code_hash = private.hash_invite_code(p_code)
  for update;

  if v_invite.id is null
     or v_invite.revoked_at is not null
     or (v_invite.expires_at is not null and v_invite.expires_at <= now())
     or (v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses)
  then
    -- Fehlversuch protokollieren und NULL liefern (kein Exception-Rollback).
    insert into public.group_invite_attempts (user_id) values (v_uid);
    return null;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_invite.group_id, v_uid, 'member')
  on conflict (group_id, user_id) do nothing;
  get diagnostics v_inserted = row_count;

  -- Nur zählen, wenn tatsächlich ein neues Mitglied hinzugekommen ist.
  if v_inserted > 0 then
    update public.group_invites
    set use_count = use_count + 1
    where id = v_invite.id;
  end if;

  return v_invite.group_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Keine Gruppe ohne Owner nach Kontolöschung
--    leave_group / set_group_member_role / remove_group_member verhindern das
--    bereits. Wird aber ein Konto gelöscht (auth.users → profiles →
--    group_members per CASCADE), greifen diese Prüfungen nicht. Dann wird das
--    dienstälteste Mitglied (Admins zuerst) zum Owner; ist niemand mehr übrig,
--    wird die leere Gruppe gelöscht.
-- -----------------------------------------------------------------------------
create or replace function private.ensure_group_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_successor uuid;
begin
  if old.role <> 'owner' then
    return null;
  end if;

  -- Gruppe wird gerade selbst gelöscht → nichts zu tun.
  if not exists (select 1 from public.groups g where g.id = old.group_id) then
    return null;
  end if;

  if exists (
    select 1 from public.group_members gm
    where gm.group_id = old.group_id and gm.role = 'owner'
  ) then
    return null;
  end if;

  select gm.id into v_successor
  from public.group_members gm
  where gm.group_id = old.group_id
  order by (gm.role = 'admin') desc, gm.joined_at, gm.id
  limit 1;

  if v_successor is null then
    delete from public.groups g where g.id = old.group_id;
  else
    update public.group_members set role = 'owner' where id = v_successor;
  end if;

  return null;
end;
$$;

revoke all on function private.ensure_group_owner() from public, anon, authenticated;

create trigger group_members_ensure_owner
  after delete on public.group_members
  for each row execute function private.ensure_group_owner();

-- -----------------------------------------------------------------------------
-- 4. Sinnvolle Standardwerte (Policies prüfen weiterhin auf auth.uid())
-- -----------------------------------------------------------------------------
alter table public.reviere   alter column created_by set default auth.uid();
alter table public.waypoints alter column created_by set default auth.uid();
alter table public.messages  alter column sender_id  set default auth.uid();
alter table public.locations alter column user_id    set default auth.uid();

-- -----------------------------------------------------------------------------
-- 5. Indizes auf Fremdschlüsseln (beschleunigt ON DELETE SET NULL und Joins)
-- -----------------------------------------------------------------------------
create index if not exists groups_created_by_idx        on public.groups (created_by);
create index if not exists group_invites_created_by_idx on public.group_invites (created_by);
create index if not exists reviere_created_by_idx       on public.reviere (created_by);
create index if not exists waypoints_created_by_idx     on public.waypoints (created_by);
create index if not exists messages_sender_id_idx       on public.messages (sender_id);
