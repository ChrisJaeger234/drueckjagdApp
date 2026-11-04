-- =============================================================================
-- 0004 – Gruppen-Funktionen (RPC)
--
-- Alle Operationen, die Mitgliedschaften verändern, laufen hier serverseitig
-- und prüfen die Berechtigung selbst. Fehler werden mit stabilen, englischen
-- Schlüsselwörtern gemeldet (z. B. 'not_authorized'), die die App in deutsche
-- Meldungen übersetzt.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Gruppe anlegen – der Ersteller wird automatisch Owner.
-- -----------------------------------------------------------------------------
create or replace function public.create_group(p_name text, p_description text default '')
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_group public.groups;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  insert into public.groups (name, description, created_by)
  values (btrim(p_name), coalesce(btrim(p_description), ''), v_uid)
  returning * into v_group;

  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, v_uid, 'owner');

  return v_group;
end;
$$;

-- -----------------------------------------------------------------------------
-- Einladungscode erzeugen
--   * 12 Zeichen Crockford-Base32 (ohne I, L, O, U) → 60 Bit Zufall aus
--     gen_random_bytes(). Beim Einlösen werden O→0 sowie I/L→1 toleriert.
--   * Gespeichert wird nur SHA-256 des normalisierten Codes.
--   * Der Klartext wird genau einmal zurückgegeben.
-- -----------------------------------------------------------------------------
create or replace function private.normalize_invite_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(
    upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')),
    'OIL',
    '011'
  );
$$;

create or replace function private.hash_invite_code(p_code text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select extensions.digest(private.normalize_invite_code(p_code), 'sha256');
$$;

create or replace function public.create_group_invite(
  p_group_id    uuid,
  p_valid_hours integer default 168,
  p_max_uses    integer default null
)
returns table (invite_id uuid, code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Crockford-Base32: 32 Zeichen, ohne I, L, O, U.
  c_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_uid     uuid := auth.uid();
  v_bytes   bytea;
  v_raw     text := '';
  v_code    text;
  v_expires timestamptz;
  v_id      uuid;
  i         integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not private.can_manage_members(p_group_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_valid_hours is not null and (p_valid_hours < 1 or p_valid_hours > 24 * 90) then
    raise exception 'invalid_validity' using errcode = '22023';
  end if;
  if p_max_uses is not null and (p_max_uses < 1 or p_max_uses > 500) then
    raise exception 'invalid_max_uses' using errcode = '22023';
  end if;

  v_expires := case when p_valid_hours is null then null
                    else now() + make_interval(hours => p_valid_hours) end;

  v_bytes := extensions.gen_random_bytes(12);
  for i in 0..11 loop
    -- 256 ist ein Vielfaches von 32 → keine Verzerrung durch den Modulo.
    v_raw := v_raw || substr(c_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  v_code := substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 4) || '-' || substr(v_raw, 9, 4);

  insert into public.group_invites (group_id, code_hash, created_by, expires_at, max_uses)
  values (p_group_id, private.hash_invite_code(v_code), v_uid, v_expires, p_max_uses)
  returning id into v_id;

  return query select v_id, v_code, v_expires;
end;
$$;

-- -----------------------------------------------------------------------------
-- Einladungscode einlösen
--   * Drosselung: max. 10 Fehlversuche je Benutzer in 15 Minuten.
--   * Ungültige, abgelaufene, widerrufene oder ausgeschöpfte Codes werden
--     nicht unterschieden (keine Informationspreisgabe).
--   * Bereits Mitglied → Gruppe wird ohne erneuten Verbrauch zurückgegeben.
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
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

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

  if exists (
    select 1 from public.group_members gm
    where gm.group_id = v_invite.group_id and gm.user_id = v_uid
  ) then
    return v_invite.group_id;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_invite.group_id, v_uid, 'member');

  update public.group_invites
  set use_count = use_count + 1
  where id = v_invite.id;

  return v_invite.group_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Einladung widerrufen
-- -----------------------------------------------------------------------------
create or replace function public.revoke_group_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  select gi.group_id into v_group_id from public.group_invites gi where gi.id = p_invite_id;

  if v_group_id is null or not private.can_manage_members(v_group_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.group_invites
  set revoked_at = coalesce(revoked_at, now())
  where id = p_invite_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Rolle eines Mitglieds ändern – nur Owner.
-- Der letzte Owner kann sich nicht selbst herabstufen.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Mitglied entfernen
--   * Owner: jedes andere Mitglied.
--   * Admin (falls vom Owner erlaubt): nur Mitglieder mit Rolle "member".
--   * Sich selbst entfernen → leave_group().
-- -----------------------------------------------------------------------------
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
  if p_user_id = v_uid then
    raise exception 'use_leave_group' using errcode = '22023';
  end if;

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

-- -----------------------------------------------------------------------------
-- Gruppe verlassen – der letzte Owner muss vorher einen Nachfolger ernennen
-- oder die Gruppe löschen.
-- -----------------------------------------------------------------------------
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
-- Ausführungsrechte: nur angemeldete Benutzer
-- -----------------------------------------------------------------------------
revoke execute on function
  public.create_group(text, text),
  public.create_group_invite(uuid, integer, integer),
  public.redeem_group_invite(text),
  public.revoke_group_invite(uuid),
  public.set_group_member_role(uuid, uuid, public.group_role),
  public.remove_group_member(uuid, uuid),
  public.leave_group(uuid)
from public, anon;

grant execute on function
  public.create_group(text, text),
  public.create_group_invite(uuid, integer, integer),
  public.redeem_group_invite(text),
  public.revoke_group_invite(uuid),
  public.set_group_member_role(uuid, uuid, public.group_role),
  public.remove_group_member(uuid, uuid),
  public.leave_group(uuid)
to authenticated;

revoke all on function private.normalize_invite_code(text), private.hash_invite_code(text)
  from public, anon, authenticated;
