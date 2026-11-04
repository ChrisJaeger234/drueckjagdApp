-- =============================================================================
-- 0010 – Jagden (Drückjagd), Teilnehmer, Zonen, Stände, Meldungen
--
-- Fachmodell:
--   hunts              Eine Jagd einer Gruppe (Termin, Revier, Freigabe,
--                      Sicherheits- und Notfallhinweise, Status).
--   hunt_zones         Vom Jagdleiter eingezeichnete Flächen: Treiben,
--                      Sicherheits- und Sperrzonen, Sammelplätze.
--   hunt_stands        Stände der Jagd (optional verknüpft mit einer
--                      jagdlichen Einrichtung aus waypoints).
--   hunt_participants  Teilnahme mit Jagdrolle (Schütze, Treiber, …),
--                      zugewiesenem Stand bzw. zugewiesener Zone.
--   hunt_reports       Strukturierte Meldungen: erlegt, angeschossen,
--                      überschossen, Anblick – mit Wildart, Ort und Zeit.
--
-- Berechtigungen (wenige organisatorische Hürden, aber Sicherheit zuerst):
--   * Lesen: alle Mitglieder der Gruppe.
--   * Jagd anlegen/löschen: Owner und Admins der Gruppe.
--   * Jagdleitung („can_manage_hunt“): Owner/Admins der Gruppe sowie
--     Teilnehmer mit Jagdrolle jagdleiter oder ansteller. Sie bearbeiten die
--     Jagd, Zonen und Stände und teilen Stände/Zonen zu.
--   * Selbst eintragen: jedes Gruppenmitglied, solange die Jagd offen ist
--     (self_join, Status geplant/laufend). Jagdleiter/Ansteller und
--     Stand-/Zonenzuteilung kann sich niemand selbst geben.
--   * Meldungen: jedes Gruppenmitglied im eigenen Namen; ändern/löschen
--     der Melder selbst oder die Jagdleitung.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Aufzählungstypen
-- -----------------------------------------------------------------------------
create type public.hunt_status as enum ('geplant', 'laufend', 'beendet', 'abgesagt');

create type public.hunt_role as enum (
  'jagdleiter',
  'ansteller',
  'schuetze',
  'treiber',
  'hundefuehrer',
  'bergung',
  'sonstige'
);

create type public.hunt_zone_kind as enum (
  'treiben',
  'sicherheitszone',
  'sperrzone',
  'sammelplatz',
  'sonstiges'
);

create type public.hunt_report_kind as enum (
  'erlegt',
  'angeschossen',
  'ueberschossen',
  'anblick',
  'sonstiges'
);

-- Für zusammengesetzte Fremdschlüssel (Revier muss zur Gruppe der Jagd gehören).
alter table public.reviere add constraint reviere_group_id_id_key unique (group_id, id);

-- -----------------------------------------------------------------------------
-- hunts
-- -----------------------------------------------------------------------------
create table public.hunts (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references public.groups (id) on delete cascade,
  revier_id         uuid,
  title             text not null,
  description       text not null default '',
  starts_at         timestamptz not null,
  ends_at           timestamptz,
  status            public.hunt_status not null default 'geplant',
  meeting_point     text not null default '',
  meeting_latitude  double precision,
  meeting_longitude double precision,
  game_release      text not null default '',
  safety_notes      text not null default '',
  emergency_info    text not null default '',
  self_join         boolean not null default true,
  created_by        uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint hunts_revier_same_group
    foreign key (group_id, revier_id) references public.reviere (group_id, id)
    on delete set null (revier_id),
  constraint hunts_title_length check (char_length(btrim(title)) between 2 and 120),
  constraint hunts_description_length check (char_length(description) <= 4000),
  constraint hunts_meeting_point_length check (char_length(meeting_point) <= 500),
  constraint hunts_game_release_length check (char_length(game_release) <= 2000),
  constraint hunts_safety_notes_length check (char_length(safety_notes) <= 4000),
  constraint hunts_emergency_info_length check (char_length(emergency_info) <= 2000),
  constraint hunts_end_after_start check (ends_at is null or ends_at > starts_at),
  constraint hunts_meeting_coordinates
    check ((meeting_latitude is null) = (meeting_longitude is null)),
  constraint hunts_meeting_latitude_range
    check (meeting_latitude is null or meeting_latitude between -90 and 90),
  constraint hunts_meeting_longitude_range
    check (meeting_longitude is null or meeting_longitude between -180 and 180)
);

create index hunts_group_start_idx on public.hunts (group_id, starts_at desc);
create index hunts_revier_id_idx on public.hunts (revier_id);
create index hunts_created_by_idx on public.hunts (created_by);

create trigger hunts_set_updated_at
  before update on public.hunts
  for each row execute function public.set_updated_at();

comment on table public.hunts is 'Jagden (z. B. Drückjagd) einer Gruppe.';
comment on column public.hunts.game_release is 'Freigabe: welches Wild erlegt werden darf.';
comment on column public.hunts.self_join is
  'Dürfen sich Gruppenmitglieder selbst als Teilnehmer eintragen?';

-- -----------------------------------------------------------------------------
-- hunt_zones
-- -----------------------------------------------------------------------------
create table public.hunt_zones (
  id             uuid primary key default gen_random_uuid(),
  hunt_id        uuid not null references public.hunts (id) on delete cascade,
  name           text not null,
  kind           public.hunt_zone_kind not null default 'treiben',
  description    text not null default '',
  color          text,
  boundary_data  jsonb not null,
  geom           extensions.geometry(MultiPolygon, 4326) not null,
  created_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint hunt_zones_hunt_id_id_key unique (hunt_id, id),
  constraint hunt_zones_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint hunt_zones_description_length check (char_length(description) <= 2000),
  constraint hunt_zones_color_format check (color is null or color ~ '^#[0-9A-Fa-f]{6}$')
);

create index hunt_zones_geom_idx on public.hunt_zones using gist (geom);
create index hunt_zones_created_by_idx on public.hunt_zones (created_by);

create trigger hunt_zones_set_updated_at
  before update on public.hunt_zones
  for each row execute function public.set_updated_at();

create trigger hunt_zones_sync_geom
  before insert or update of boundary_data on public.hunt_zones
  for each row execute function private.sync_boundary_geom();

comment on table public.hunt_zones is
  'Flächen einer Jagd (Treiben, Sicherheits-/Sperrzonen, Sammelplätze). geom wird aus boundary_data gepflegt.';

-- -----------------------------------------------------------------------------
-- hunt_stands
-- -----------------------------------------------------------------------------
create table public.hunt_stands (
  id           uuid primary key default gen_random_uuid(),
  hunt_id      uuid not null references public.hunts (id) on delete cascade,
  label        text not null,
  waypoint_id  uuid references public.waypoints (id) on delete set null,
  zone_id      uuid,
  latitude     double precision not null,
  longitude    double precision not null,
  geom         extensions.geography(Point, 4326)
               generated always as (
                 extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
               ) stored,
  description  text not null default '',
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint hunt_stands_hunt_id_id_key unique (hunt_id, id),
  constraint hunt_stands_zone_same_hunt
    foreign key (hunt_id, zone_id) references public.hunt_zones (hunt_id, id)
    on delete set null (zone_id),
  constraint hunt_stands_label_length check (char_length(btrim(label)) between 1 and 60),
  constraint hunt_stands_description_length check (char_length(description) <= 2000),
  constraint hunt_stands_latitude_range check (latitude between -90 and 90),
  constraint hunt_stands_longitude_range check (longitude between -180 and 180)
);

create unique index hunt_stands_label_key on public.hunt_stands (hunt_id, lower(btrim(label)));
create index hunt_stands_waypoint_id_idx on public.hunt_stands (waypoint_id);
create index hunt_stands_zone_idx on public.hunt_stands (hunt_id, zone_id);
create index hunt_stands_geom_idx on public.hunt_stands using gist (geom);

create trigger hunt_stands_set_updated_at
  before update on public.hunt_stands
  for each row execute function public.set_updated_at();

comment on table public.hunt_stands is
  'Stände einer Jagd. Optional mit einer jagdlichen Einrichtung (waypoints) derselben Gruppe verknüpft.';

-- -----------------------------------------------------------------------------
-- hunt_participants
-- -----------------------------------------------------------------------------
create table public.hunt_participants (
  id          uuid primary key default gen_random_uuid(),
  hunt_id     uuid not null references public.hunts (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  role        public.hunt_role not null default 'schuetze',
  stand_id    uuid,
  zone_id     uuid,
  note        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint hunt_participants_unique unique (hunt_id, user_id),
  constraint hunt_participants_stand_same_hunt
    foreign key (hunt_id, stand_id) references public.hunt_stands (hunt_id, id)
    on delete set null (stand_id),
  constraint hunt_participants_zone_same_hunt
    foreign key (hunt_id, zone_id) references public.hunt_zones (hunt_id, id)
    on delete set null (zone_id),
  constraint hunt_participants_note_length check (char_length(note) <= 500)
);

create index hunt_participants_user_id_idx on public.hunt_participants (user_id);
create index hunt_participants_stand_idx on public.hunt_participants (hunt_id, stand_id);
create index hunt_participants_zone_idx on public.hunt_participants (hunt_id, zone_id);

create trigger hunt_participants_set_updated_at
  before update on public.hunt_participants
  for each row execute function public.set_updated_at();

comment on table public.hunt_participants is
  'Teilnahme an einer Jagd mit Jagdrolle und Zuteilung (Stand für Schützen, Zone z. B. für Treiber).';

-- -----------------------------------------------------------------------------
-- hunt_reports
-- -----------------------------------------------------------------------------
create table public.hunt_reports (
  id           uuid primary key default gen_random_uuid(),
  hunt_id      uuid not null references public.hunts (id) on delete cascade,
  reporter_id  uuid references public.profiles (id) on delete set null default auth.uid(),
  kind         public.hunt_report_kind not null,
  species      text not null default '',
  count        integer not null default 1,
  stand_id     uuid,
  latitude     double precision,
  longitude    double precision,
  geom         extensions.geography(Point, 4326)
               generated always as (
                 case when latitude is not null and longitude is not null then
                   extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
                 end
               ) stored,
  note         text not null default '',
  occurred_at  timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint hunt_reports_stand_same_hunt
    foreign key (hunt_id, stand_id) references public.hunt_stands (hunt_id, id)
    on delete set null (stand_id),
  constraint hunt_reports_species_length check (char_length(species) <= 60),
  constraint hunt_reports_count_range check (count between 1 and 100),
  constraint hunt_reports_note_length check (char_length(note) <= 1000),
  constraint hunt_reports_coordinates check ((latitude is null) = (longitude is null)),
  constraint hunt_reports_latitude_range check (latitude is null or latitude between -90 and 90),
  constraint hunt_reports_longitude_range check (longitude is null or longitude between -180 and 180)
);

create index hunt_reports_hunt_time_idx on public.hunt_reports (hunt_id, occurred_at desc);
create index hunt_reports_reporter_id_idx on public.hunt_reports (reporter_id);
create index hunt_reports_resolved_by_idx on public.hunt_reports (resolved_by);
create index hunt_reports_stand_idx on public.hunt_reports (hunt_id, stand_id);

create trigger hunt_reports_set_updated_at
  before update on public.hunt_reports
  for each row execute function public.set_updated_at();

comment on table public.hunt_reports is
  'Meldungen während der Jagd (erlegt, angeschossen, überschossen, Anblick).';
comment on column public.hunt_reports.resolved_at is
  'Erledigt-Zeitpunkt, z. B. Nachsuche abgeschlossen oder Stück geborgen.';

-- -----------------------------------------------------------------------------
-- Berechtigungs-Hilfsfunktionen
-- -----------------------------------------------------------------------------
create or replace function private.hunt_group_id(p_hunt_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select h.group_id from public.hunts h where h.id = p_hunt_id;
$$;

-- Jagdleitung: Owner/Admin der Gruppe oder Jagdleiter/Ansteller der Jagd.
create or replace function private.can_manage_hunt(p_hunt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hunts h
    join public.group_members gm
      on gm.group_id = h.group_id and gm.user_id = (select auth.uid())
    where h.id = p_hunt_id
      and (
        gm.role in ('owner', 'admin')
        or exists (
          select 1 from public.hunt_participants hp
          where hp.hunt_id = h.id
            and hp.user_id = gm.user_id
            and hp.role in ('jagdleiter', 'ansteller')
        )
      )
  );
$$;

-- Darf sich der aktuelle Benutzer selbst in die Jagd eintragen?
create or replace function private.can_self_join_hunt(p_hunt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hunts h
    join public.group_members gm
      on gm.group_id = h.group_id and gm.user_id = (select auth.uid())
    where h.id = p_hunt_id
      and h.self_join
      and h.status in ('geplant', 'laufend')
  );
$$;

revoke all on function private.hunt_group_id(uuid) from public, anon;
revoke all on function private.can_manage_hunt(uuid) from public, anon;
revoke all on function private.can_self_join_hunt(uuid) from public, anon;
grant execute on function private.hunt_group_id(uuid) to authenticated;
grant execute on function private.can_manage_hunt(uuid) to authenticated;
grant execute on function private.can_self_join_hunt(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Integritäts-Trigger
-- -----------------------------------------------------------------------------

-- Wer eine Jagd anlegt, ist automatisch Jagdleiter.
create or replace function private.add_hunt_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null then
    insert into public.hunt_participants (hunt_id, user_id, role)
    values (new.id, new.created_by, 'jagdleiter')
    on conflict (hunt_id, user_id) do nothing;
  end if;
  return null;
end;
$$;

revoke all on function private.add_hunt_creator() from public, anon, authenticated;

create trigger hunts_add_creator
  after insert on public.hunts
  for each row execute function private.add_hunt_creator();

-- Stand: verknüpfte Einrichtung muss zur selben Gruppe gehören.
create or replace function private.check_hunt_stand_waypoint()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.waypoint_id is not null and not exists (
    select 1
    from public.waypoints w
    join public.reviere r on r.id = w.revier_id
    join public.hunts h on h.group_id = r.group_id
    where w.id = new.waypoint_id and h.id = new.hunt_id
  ) then
    raise exception 'waypoint_not_in_group' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.check_hunt_stand_waypoint() from public, anon, authenticated;

create trigger hunt_stands_check_waypoint
  before insert or update of waypoint_id on public.hunt_stands
  for each row execute function private.check_hunt_stand_waypoint();

-- Teilnehmer: Selbsteintragung und Zuteilungen absichern.
--   * Teilnehmer müssen Mitglied der Gruppe sein.
--   * Ohne Jagdleitungsrecht: nur sich selbst eintragen/ändern, keine
--     Leitungsrolle, keine Stand-/Zonenzuteilung.
--   * Jagdleiter ernennen nur Owner/Admins der Gruppe oder ein Jagdleiter,
--     nicht ein Ansteller. Owner/Admins leiten jede Jagd der Gruppe ohnehin
--     mit, daher bleibt eine Jagd nie ohne Leitung.
create or replace function private.guard_hunt_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
  v_uid   uuid := (select auth.uid());
begin
  -- Interne Aufrufe (z. B. Trigger add_hunt_creator, Service-Rolle) ohne Benutzer.
  if v_uid is null then
    return new;
  end if;

  select h.group_id into v_group from public.hunts h where h.id = new.hunt_id;

  -- Außenstehende erhalten dieselbe Antwort wie bei fehlender Berechtigung,
  -- unabhängig davon, ob die Jagd existiert.
  if v_group is null or not private.is_group_member(v_group) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.group_members gm
    where gm.group_id = v_group and gm.user_id = new.user_id
  ) then
    raise exception 'not_a_group_member' using errcode = '23514';
  end if;

  if private.can_manage_hunt(new.hunt_id) then
    -- Eine Leitungsperson ohne Gruppen-Admin-Rechte darf niemanden zum
    -- Jagdleiter machen, wenn sie selbst nur Ansteller ist.
    if new.role = 'jagdleiter'
       and (tg_op = 'INSERT' or old.role is distinct from 'jagdleiter')
       and not private.has_group_role(v_group, array['owner', 'admin']::public.group_role[])
       and not exists (
         select 1 from public.hunt_participants hp
         where hp.hunt_id = new.hunt_id and hp.user_id = v_uid and hp.role = 'jagdleiter'
       ) then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.user_id <> v_uid then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if new.role in ('jagdleiter', 'ansteller') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.stand_id is not null or new.zone_id is not null then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
  else
    if new.stand_id is distinct from old.stand_id or new.zone_id is distinct from old.zone_id then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_hunt_participant() from public, anon, authenticated;

create trigger hunt_participants_guard
  before insert or update on public.hunt_participants
  for each row execute function private.guard_hunt_participant();

-- Meldungen: Erledigt-Vermerk wird vom Server gesetzt.
create or replace function private.stamp_hunt_report_resolution()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.resolved_by := case when new.resolved_at is null then null else (select auth.uid()) end;
  elsif new.resolved_at is distinct from old.resolved_at then
    new.resolved_by := case when new.resolved_at is null then null else (select auth.uid()) end;
  else
    new.resolved_by := old.resolved_by;
  end if;
  return new;
end;
$$;

revoke all on function private.stamp_hunt_report_resolution() from public, anon, authenticated;

create trigger hunt_reports_stamp_resolution
  before insert or update on public.hunt_reports
  for each row execute function private.stamp_hunt_report_resolution();

-- -----------------------------------------------------------------------------
-- Rechte (Spaltenrechte verhindern das Umhängen von hunt_id/group_id usw.)
-- -----------------------------------------------------------------------------
revoke all on
  public.hunts,
  public.hunt_zones,
  public.hunt_stands,
  public.hunt_participants,
  public.hunt_reports
from anon, authenticated;

grant select, delete on public.hunts to authenticated;
grant insert (id, group_id, revier_id, title, description, starts_at, ends_at, status,
              meeting_point, meeting_latitude, meeting_longitude, game_release,
              safety_notes, emergency_info, self_join, created_by)
  on public.hunts to authenticated;
grant update (revier_id, title, description, starts_at, ends_at, status, meeting_point,
              meeting_latitude, meeting_longitude, game_release, safety_notes,
              emergency_info, self_join)
  on public.hunts to authenticated;

grant select, delete on public.hunt_zones to authenticated;
grant insert (id, hunt_id, name, kind, description, color, boundary_data, created_by)
  on public.hunt_zones to authenticated;
grant update (name, kind, description, color, boundary_data) on public.hunt_zones to authenticated;

grant select, delete on public.hunt_stands to authenticated;
grant insert (id, hunt_id, label, waypoint_id, zone_id, latitude, longitude, description, sort_order)
  on public.hunt_stands to authenticated;
grant update (label, waypoint_id, zone_id, latitude, longitude, description, sort_order)
  on public.hunt_stands to authenticated;

grant select, delete on public.hunt_participants to authenticated;
grant insert (id, hunt_id, user_id, role, stand_id, zone_id, note)
  on public.hunt_participants to authenticated;
grant update (role, stand_id, zone_id, note) on public.hunt_participants to authenticated;

grant select, delete on public.hunt_reports to authenticated;
grant insert (id, hunt_id, reporter_id, kind, species, count, stand_id, latitude, longitude,
              note, occurred_at, resolved_at)
  on public.hunt_reports to authenticated;
grant update (kind, species, count, stand_id, latitude, longitude, note, occurred_at, resolved_at)
  on public.hunt_reports to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.hunts             enable row level security;
alter table public.hunt_zones        enable row level security;
alter table public.hunt_stands       enable row level security;
alter table public.hunt_participants enable row level security;
alter table public.hunt_reports      enable row level security;

-- hunts
create policy "hunts: Gruppenmitglieder lesen"
  on public.hunts for select to authenticated
  using (private.is_group_member(group_id));

create policy "hunts: Owner und Admins anlegen"
  on public.hunts for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.has_group_role(group_id, array['owner', 'admin']::public.group_role[])
  );

create policy "hunts: Jagdleitung bearbeiten"
  on public.hunts for update to authenticated
  using (private.can_manage_hunt(id))
  with check (private.can_manage_hunt(id));

create policy "hunts: Owner und Admins löschen"
  on public.hunts for delete to authenticated
  using (private.has_group_role(group_id, array['owner', 'admin']::public.group_role[]));

-- hunt_zones
create policy "hunt_zones: Gruppenmitglieder lesen"
  on public.hunt_zones for select to authenticated
  using (private.is_group_member(private.hunt_group_id(hunt_id)));

create policy "hunt_zones: Jagdleitung anlegen"
  on public.hunt_zones for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.can_manage_hunt(hunt_id)
  );

create policy "hunt_zones: Jagdleitung bearbeiten"
  on public.hunt_zones for update to authenticated
  using (private.can_manage_hunt(hunt_id))
  with check (private.can_manage_hunt(hunt_id));

create policy "hunt_zones: Jagdleitung löschen"
  on public.hunt_zones for delete to authenticated
  using (private.can_manage_hunt(hunt_id));

-- hunt_stands
create policy "hunt_stands: Gruppenmitglieder lesen"
  on public.hunt_stands for select to authenticated
  using (private.is_group_member(private.hunt_group_id(hunt_id)));

create policy "hunt_stands: Jagdleitung anlegen"
  on public.hunt_stands for insert to authenticated
  with check (private.can_manage_hunt(hunt_id));

create policy "hunt_stands: Jagdleitung bearbeiten"
  on public.hunt_stands for update to authenticated
  using (private.can_manage_hunt(hunt_id))
  with check (private.can_manage_hunt(hunt_id));

create policy "hunt_stands: Jagdleitung löschen"
  on public.hunt_stands for delete to authenticated
  using (private.can_manage_hunt(hunt_id));

-- hunt_participants
create policy "hunt_participants: Gruppenmitglieder lesen"
  on public.hunt_participants for select to authenticated
  using (private.is_group_member(private.hunt_group_id(hunt_id)));

create policy "hunt_participants: selbst eintragen oder Jagdleitung"
  on public.hunt_participants for insert to authenticated
  with check (
    private.can_manage_hunt(hunt_id)
    or (user_id = (select auth.uid()) and private.can_self_join_hunt(hunt_id))
  );

create policy "hunt_participants: eigene Teilnahme oder Jagdleitung bearbeiten"
  on public.hunt_participants for update to authenticated
  using (
    private.is_group_member(private.hunt_group_id(hunt_id))
    and (user_id = (select auth.uid()) or private.can_manage_hunt(hunt_id))
  )
  with check (
    private.is_group_member(private.hunt_group_id(hunt_id))
    and (user_id = (select auth.uid()) or private.can_manage_hunt(hunt_id))
  );

create policy "hunt_participants: austragen oder Jagdleitung entfernt"
  on public.hunt_participants for delete to authenticated
  using (
    user_id = (select auth.uid())
    or private.can_manage_hunt(hunt_id)
  );

-- hunt_reports
create policy "hunt_reports: Gruppenmitglieder lesen"
  on public.hunt_reports for select to authenticated
  using (private.is_group_member(private.hunt_group_id(hunt_id)));

create policy "hunt_reports: Gruppenmitglieder melden im eigenen Namen"
  on public.hunt_reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and private.is_group_member(private.hunt_group_id(hunt_id))
  );

create policy "hunt_reports: Melder oder Jagdleitung bearbeiten"
  on public.hunt_reports for update to authenticated
  using (
    private.is_group_member(private.hunt_group_id(hunt_id))
    and (reporter_id = (select auth.uid()) or private.can_manage_hunt(hunt_id))
  )
  with check (private.is_group_member(private.hunt_group_id(hunt_id)));

create policy "hunt_reports: Melder oder Jagdleitung löschen"
  on public.hunt_reports for delete to authenticated
  using (
    private.is_group_member(private.hunt_group_id(hunt_id))
    and (reporter_id = (select auth.uid()) or private.can_manage_hunt(hunt_id))
  );

-- -----------------------------------------------------------------------------
-- Wer die Gruppe verlässt oder entfernt wird, verliert auch seine Teilnahmen
-- an den Jagden dieser Gruppe (sonst blieben Stand-Zuteilungen verwaist).
-- Meldungen bleiben als Jagdprotokoll erhalten.
-- -----------------------------------------------------------------------------
create or replace function private.remove_hunt_participation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.hunt_participants hp
  using public.hunts h
  where h.id = hp.hunt_id
    and h.group_id = old.group_id
    and hp.user_id = old.user_id;
  return null;
end;
$$;

revoke all on function private.remove_hunt_participation() from public, anon, authenticated;

create trigger group_members_remove_hunt_participation
  after delete on public.group_members
  for each row execute function private.remove_hunt_participation();
