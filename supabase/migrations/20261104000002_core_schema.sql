-- =============================================================================
-- 0002 – Kernschema: Profile, Gruppen, Mitgliedschaften, Einladungen, Reviere
--        sowie vorbereitete Tabellen für Phase 2 (Grenzen, Wegpunkte,
--        Standorte, Nachrichten).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Aufzählungstypen
-- -----------------------------------------------------------------------------
create type public.group_role as enum ('owner', 'admin', 'member');

create type public.waypoint_category as enum (
  'hochsitz',
  'kanzel',
  'kirrung',
  'fuetterung',
  'wildkamera',
  'weg',
  'gefahr',
  'sonstiges'
);

-- -----------------------------------------------------------------------------
-- profiles – 1:1 zu auth.users
-- -----------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text,
  display_name text not null default '',
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint profiles_username_format
    check (username is null or username ~ '^[a-z0-9_]{3,24}$'),
  constraint profiles_display_name_length
    check (char_length(display_name) <= 60),
  constraint profiles_avatar_url_length
    check (avatar_url is null or char_length(avatar_url) <= 1024)
);

create unique index profiles_username_key on public.profiles (username);

comment on table public.profiles is 'Öffentliche Benutzerprofile (1:1 zu auth.users).';
comment on column public.profiles.username is
  'Eindeutiger Benutzername, nur a-z, 0-9 und _, 3–24 Zeichen. Optional bis zur Profilvervollständigung.';
comment on column public.profiles.avatar_url is
  'Pfad im privaten Storage-Bucket "avatars" (<user_id>/<datei>).';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- groups – Jagdgruppen
-- -----------------------------------------------------------------------------
create table public.groups (
  id                         uuid primary key default gen_random_uuid(),
  name                       text not null,
  description                text not null default '',
  created_by                 uuid references public.profiles (id) on delete set null,
  admins_can_manage_members  boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),

  constraint groups_name_length
    check (char_length(btrim(name)) between 2 and 80),
  constraint groups_description_length
    check (char_length(description) <= 1000)
);

comment on table public.groups is 'Jagdgruppen. Anlage ausschließlich über public.create_group().';
comment on column public.groups.admins_can_manage_members is
  'Vom Owner steuerbar: dürfen Admins Mitglieder (Rolle member) einladen und entfernen?';

create trigger groups_set_updated_at
  before update on public.groups
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- group_members – Mitgliedschaften mit Rolle
-- -----------------------------------------------------------------------------
create table public.group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.group_role not null default 'member',
  joined_at  timestamptz not null default now(),

  constraint group_members_unique_membership unique (group_id, user_id)
);

create index group_members_user_id_idx on public.group_members (user_id);

comment on table public.group_members is
  'Mitgliedschaften. Schreibzugriffe nur über SECURITY-DEFINER-Funktionen.';

-- -----------------------------------------------------------------------------
-- group_invites – Einladungscodes (nur Hash gespeichert)
-- -----------------------------------------------------------------------------
create table public.group_invites (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  code_hash   bytea not null,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,
  max_uses    integer,
  use_count   integer not null default 0,
  revoked_at  timestamptz,

  constraint group_invites_code_hash_key unique (code_hash),
  constraint group_invites_max_uses_positive check (max_uses is null or max_uses > 0),
  constraint group_invites_use_count_valid
    check (use_count >= 0 and (max_uses is null or use_count <= max_uses)),
  constraint group_invites_expiry_after_creation
    check (expires_at is null or expires_at > created_at)
);

create index group_invites_group_id_idx on public.group_invites (group_id);

comment on table public.group_invites is
  'Einladungscodes. Der Klartext wird nie gespeichert, nur SHA-256(code).';

-- Fehlversuche beim Einlösen – Grundlage für eine einfache Drosselung.
create table public.group_invite_attempts (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  attempted_at  timestamptz not null default now()
);

create index group_invite_attempts_user_time_idx
  on public.group_invite_attempts (user_id, attempted_at desc);

comment on table public.group_invite_attempts is
  'Fehlgeschlagene Einlöseversuche (Brute-Force-Schutz). Kein Clientzugriff.';

-- -----------------------------------------------------------------------------
-- reviere – mehrere Reviere pro Gruppe
-- -----------------------------------------------------------------------------
create table public.reviere (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text not null default '',
  group_id     uuid not null references public.groups (id) on delete cascade,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint reviere_name_length check (char_length(btrim(name)) between 2 and 120),
  constraint reviere_description_length check (char_length(description) <= 2000)
);

create index reviere_group_id_idx on public.reviere (group_id);
create unique index reviere_group_name_key on public.reviere (group_id, lower(btrim(name)));

create trigger reviere_set_updated_at
  before update on public.reviere
  for each row execute function public.set_updated_at();

comment on table public.reviere is 'Reviere einer Jagdgruppe.';

-- -----------------------------------------------------------------------------
-- revier_boundaries – Vorbereitung Reviergrenzen (Phase 2: PostGIS-Geometrie)
-- -----------------------------------------------------------------------------
create table public.revier_boundaries (
  id             uuid primary key default gen_random_uuid(),
  revier_id      uuid not null references public.reviere (id) on delete cascade,
  boundary_data  jsonb not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint revier_boundaries_geojson_object
    check (jsonb_typeof(boundary_data) = 'object' and boundary_data ? 'type')
);

create index revier_boundaries_revier_id_idx on public.revier_boundaries (revier_id);

create trigger revier_boundaries_set_updated_at
  before update on public.revier_boundaries
  for each row execute function public.set_updated_at();

comment on table public.revier_boundaries is
  'Reviergrenzen als GeoJSON. In Phase 2 ergänzt um eine PostGIS-Spalte geometry(MultiPolygon, 4326).';

-- -----------------------------------------------------------------------------
-- waypoints – Vorbereitung Wegpunkte / jagdliche Einrichtungen
-- -----------------------------------------------------------------------------
create table public.waypoints (
  id           uuid primary key default gen_random_uuid(),
  revier_id    uuid not null references public.reviere (id) on delete cascade,
  created_by   uuid references public.profiles (id) on delete set null,
  name         text not null,
  description  text not null default '',
  category     public.waypoint_category not null default 'sonstiges',
  latitude     double precision not null,
  longitude    double precision not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint waypoints_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint waypoints_description_length check (char_length(description) <= 2000),
  constraint waypoints_latitude_range check (latitude between -90 and 90),
  constraint waypoints_longitude_range check (longitude between -180 and 180)
);

create index waypoints_revier_id_idx on public.waypoints (revier_id);

create trigger waypoints_set_updated_at
  before update on public.waypoints
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- locations – Vorbereitung Standortfreigabe (Phase 1: nur eigene Daten lesbar)
-- -----------------------------------------------------------------------------
create table public.locations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  group_id     uuid not null references public.groups (id) on delete cascade,
  latitude     double precision not null,
  longitude    double precision not null,
  accuracy     double precision,
  recorded_at  timestamptz not null default now(),

  constraint locations_latitude_range check (latitude between -90 and 90),
  constraint locations_longitude_range check (longitude between -180 and 180),
  constraint locations_accuracy_positive check (accuracy is null or accuracy >= 0)
);

create index locations_group_time_idx on public.locations (group_id, recorded_at desc);
create index locations_user_time_idx on public.locations (user_id, recorded_at desc);

comment on table public.locations is
  'GPS-Positionen. Phase 1: jeder sieht nur die eigenen. Freigabe innerhalb der Gruppe folgt in Phase 2.';

-- -----------------------------------------------------------------------------
-- messages – Vorbereitung Gruppenchat
-- -----------------------------------------------------------------------------
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  sender_id   uuid references public.profiles (id) on delete set null,
  content     text not null,
  created_at  timestamptz not null default now(),

  constraint messages_content_length check (char_length(btrim(content)) between 1 and 4000)
);

create index messages_group_time_idx on public.messages (group_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Profil automatisch anlegen, wenn sich ein Benutzer registriert
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
