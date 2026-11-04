-- =============================================================================
-- 0007 – Fixes aus dem RLS-Sicherheitstest vor Phase 2
--
-- Rein additive Härtung, keine Daten werden gelöscht, keine Regel gelockert.
--
--   1. Entfernte Mitglieder können nicht mehr mit einem alten, noch gültigen
--      Einladungscode wieder beitreten. Gilt nur für Codes, die VOR der
--      Entfernung erstellt wurden; eine neue Einladung funktioniert weiterhin
--      (bewusste Wiederaufnahme). Freiwilliges Verlassen sperrt nicht.
--   2. remove_group_member verrät Außenstehenden nicht mehr, ob eine Person
--      Mitglied einer Gruppe ist (vorher: 'member_not_found' vs.
--      'not_authorized').
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1a. Protokoll der Entfernungen (kein Clientzugriff)
-- -----------------------------------------------------------------------------
create table if not exists public.group_member_removals (
  group_id    uuid not null references public.groups (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  removed_by  uuid references auth.users (id) on delete set null,
  removed_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists group_member_removals_user_id_idx
  on public.group_member_removals (user_id);
create index if not exists group_member_removals_removed_by_idx
  on public.group_member_removals (removed_by);

comment on table public.group_member_removals is
  'Wer wann aus einer Gruppe entfernt wurde. Sperrt ältere Einladungscodes für diese Person. Kein Clientzugriff.';

alter table public.group_member_removals enable row level security;
revoke all on public.group_member_removals from public, anon, authenticated;
-- RLS aktiv, keine Policy, keine Rechte → nur SECURITY-DEFINER-Funktionen.

-- -----------------------------------------------------------------------------
-- 1b + 2. Mitglied entfernen: Entfernung protokollieren, nichts preisgeben
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
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_user_id = v_uid then
    raise exception 'use_leave_group' using errcode = '22023';
  end if;

  perform private.lock_group(p_group_id);

  -- Wer Mitglieder nicht verwalten darf, erfährt nichts über die Gruppe.
  if not private.can_manage_members(p_group_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select gm.role into v_target_role
  from public.group_members gm
  where gm.group_id = p_group_id and gm.user_id = p_user_id;

  if v_target_role is null then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;

  if private.has_group_role(p_group_id, array['owner']::public.group_role[]) then
    null; -- Owner darf alle anderen entfernen.
  elsif v_target_role = 'member' then
    null; -- Admin mit Freigabe (can_manage_members) darf einfache Mitglieder entfernen.
  else
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  delete from public.group_members
  where group_id = p_group_id and user_id = p_user_id;

  insert into public.group_member_removals (group_id, user_id, removed_by, removed_at)
  values (p_group_id, p_user_id, v_uid, now())
  on conflict (group_id, user_id)
  do update set removed_by = excluded.removed_by, removed_at = excluded.removed_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1c. Einladung einlösen: ältere Codes gelten nicht für entfernte Personen
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

  -- Ungültig, widerrufen, abgelaufen, ausgeschöpft oder – neu – für eine
  -- Person, die nach Erstellung des Codes aus der Gruppe entfernt wurde.
  -- Alle Fälle sehen für den Aufrufer gleich aus (keine Informationspreisgabe).
  if v_invite.id is null
     or v_invite.revoked_at is not null
     or (v_invite.expires_at is not null and v_invite.expires_at <= now())
     or (v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses)
     or exists (
       select 1 from public.group_member_removals r
       where r.group_id = v_invite.group_id
         and r.user_id = v_uid
         and r.removed_at >= v_invite.created_at
     )
  then
    insert into public.group_invite_attempts (user_id) values (v_uid);
    return null;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_invite.group_id, v_uid, 'member')
  on conflict (group_id, user_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    update public.group_invites
    set use_count = use_count + 1
    where id = v_invite.id;
  end if;

  return v_invite.group_id;
end;
$$;

-- Ausführungsrechte nach CREATE OR REPLACE erneut festlegen (unverändert zu 0004).
revoke execute on function
  public.remove_group_member(uuid, uuid),
  public.redeem_group_invite(text)
from public, anon;

grant execute on function
  public.remove_group_member(uuid, uuid),
  public.redeem_group_invite(text)
to authenticated;
