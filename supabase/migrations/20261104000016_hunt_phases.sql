-- =============================================================================
-- 0016 – Phasen einer Jagd (Abschnitte mit eigener Zuteilung)
--
-- Eine Jagd kann in Phasen geplant werden (Phase 1, Phase 2, …). Für jede Phase
-- gibt es eine eigene Zuteilung von Ständen und Zonen an die Teilnehmer. Die
-- Jagdleitung schaltet die aktive Phase um; dabei wird deren Zuteilung in
-- hunt_participants (stand_id, zone_id) übernommen. So zeigen alle bestehenden
-- Ansichten (auch die Flutter-App) automatisch die Stände der aktiven Phase.
--
-- Nur Ergänzungen:
--   * neue Tabellen hunt_phases und hunt_phase_assignments (RLS wie Stände)
--   * neue, leere Spalte hunts.current_phase_id
--   * Eindeutigkeit (hunt_id, id) für hunt_participants (id ist ohnehin eindeutig)
--   * Funktion activate_hunt_phase und ein Trigger, der Änderungen an der
--     Zuteilung der aktiven Phase mitschreibt
-- Ohne Phasen verhält sich eine Jagd genau wie bisher.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabellen
-- -----------------------------------------------------------------------------
create table if not exists public.hunt_phases (
  id          uuid primary key default gen_random_uuid(),
  hunt_id     uuid not null references public.hunts (id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),

  constraint hunt_phases_hunt_id_id_key unique (hunt_id, id),
  constraint hunt_phases_name_length check (char_length(btrim(name)) between 1 and 60)
);

create index if not exists hunt_phases_hunt_idx on public.hunt_phases (hunt_id, sort_order);

comment on table public.hunt_phases is
  'Phasen (Abschnitte) einer Jagd. Die aktive Phase steht in hunts.current_phase_id.';

alter table public.hunts
  add column if not exists current_phase_id uuid;

alter table public.hunts
  add constraint hunts_current_phase_same_hunt
  foreign key (id, current_phase_id) references public.hunt_phases (hunt_id, id)
  on delete set null (current_phase_id);

comment on column public.hunts.current_phase_id is
  'Aktive Phase; null = Jagd ohne Phasen bzw. keine aktiv.';

alter table public.hunt_participants
  add constraint hunt_participants_hunt_id_id_key unique (hunt_id, id);

create table if not exists public.hunt_phase_assignments (
  hunt_id         uuid not null,
  phase_id        uuid not null,
  participant_id  uuid not null,
  stand_id        uuid,
  zone_id         uuid,
  updated_at      timestamptz not null default now(),

  primary key (phase_id, participant_id),
  constraint hunt_phase_assignments_phase
    foreign key (hunt_id, phase_id) references public.hunt_phases (hunt_id, id) on delete cascade,
  constraint hunt_phase_assignments_participant
    foreign key (hunt_id, participant_id) references public.hunt_participants (hunt_id, id) on delete cascade,
  constraint hunt_phase_assignments_stand
    foreign key (hunt_id, stand_id) references public.hunt_stands (hunt_id, id) on delete set null (stand_id),
  constraint hunt_phase_assignments_zone
    foreign key (hunt_id, zone_id) references public.hunt_zones (hunt_id, id) on delete set null (zone_id)
);

create index if not exists hunt_phase_assignments_hunt_idx on public.hunt_phase_assignments (hunt_id);
create index if not exists hunt_phase_assignments_participant_idx on public.hunt_phase_assignments (hunt_id, participant_id);
create index if not exists hunt_phase_assignments_stand_idx on public.hunt_phase_assignments (hunt_id, stand_id);
create index if not exists hunt_phase_assignments_zone_idx on public.hunt_phase_assignments (hunt_id, zone_id);

comment on table public.hunt_phase_assignments is
  'Zuteilung von Stand und Zone je Phase und Teilnehmer.';

-- -----------------------------------------------------------------------------
-- Rechte und RLS (wie Stände: Gruppenmitglieder lesen, Jagdleitung schreibt)
-- -----------------------------------------------------------------------------
revoke all on public.hunt_phases from public, anon, authenticated;
revoke all on public.hunt_phase_assignments from public, anon, authenticated;

grant select, delete on public.hunt_phases to authenticated;
grant insert (id, hunt_id, name, sort_order) on public.hunt_phases to authenticated;
grant update (name, sort_order) on public.hunt_phases to authenticated;

grant select, delete on public.hunt_phase_assignments to authenticated;
grant insert (hunt_id, phase_id, participant_id, stand_id, zone_id) on public.hunt_phase_assignments to authenticated;
grant update (stand_id, zone_id) on public.hunt_phase_assignments to authenticated;

grant update (current_phase_id) on public.hunts to authenticated;

alter table public.hunt_phases enable row level security;
alter table public.hunt_phase_assignments enable row level security;

create policy "hunt_phases: Gruppenmitglieder lesen"
  on public.hunt_phases for select to authenticated
  using (private.is_group_member(private.hunt_group_id(hunt_id)));
create policy "hunt_phases: Jagdleitung anlegen"
  on public.hunt_phases for insert to authenticated
  with check (private.can_manage_hunt(hunt_id));
create policy "hunt_phases: Jagdleitung bearbeiten"
  on public.hunt_phases for update to authenticated
  using (private.can_manage_hunt(hunt_id))
  with check (private.can_manage_hunt(hunt_id));
create policy "hunt_phases: Jagdleitung löschen"
  on public.hunt_phases for delete to authenticated
  using (private.can_manage_hunt(hunt_id));

create policy "hunt_phase_assignments: Gruppenmitglieder lesen"
  on public.hunt_phase_assignments for select to authenticated
  using (private.is_group_member(private.hunt_group_id(hunt_id)));
create policy "hunt_phase_assignments: Jagdleitung anlegen"
  on public.hunt_phase_assignments for insert to authenticated
  with check (private.can_manage_hunt(hunt_id));
create policy "hunt_phase_assignments: Jagdleitung bearbeiten"
  on public.hunt_phase_assignments for update to authenticated
  using (private.can_manage_hunt(hunt_id))
  with check (private.can_manage_hunt(hunt_id));
create policy "hunt_phase_assignments: Jagdleitung löschen"
  on public.hunt_phase_assignments for delete to authenticated
  using (private.can_manage_hunt(hunt_id));

-- -----------------------------------------------------------------------------
-- Aktive Phase umschalten
-- -----------------------------------------------------------------------------
-- Übernimmt die Zuteilung der Phase in hunt_participants (Teilnehmer ohne
-- Eintrag in der Phase haben dann keinen Stand und keine Zone) und setzt
-- hunts.current_phase_id. Läuft mit den Rechten des Aufrufers (RLS gilt).
create or replace function public.activate_hunt_phase(p_hunt_id uuid, p_phase_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not private.can_manage_hunt(p_hunt_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.hunt_phases where id = p_phase_id and hunt_id = p_hunt_id) then
    raise exception 'phase_not_found' using errcode = '23503';
  end if;

  update public.hunts set current_phase_id = p_phase_id where id = p_hunt_id;

  update public.hunt_participants hp
     set stand_id = a.stand_id,
         zone_id  = a.zone_id
    from (
      select p.id, pa.stand_id, pa.zone_id
        from public.hunt_participants p
        left join public.hunt_phase_assignments pa
          on pa.phase_id = p_phase_id and pa.participant_id = p.id
       where p.hunt_id = p_hunt_id
    ) a
   where hp.id = a.id
     and (hp.stand_id is distinct from a.stand_id or hp.zone_id is distinct from a.zone_id);
end;
$$;

revoke all on function public.activate_hunt_phase(uuid, uuid) from public, anon;
grant execute on function public.activate_hunt_phase(uuid, uuid) to authenticated;

-- Ändert die Jagdleitung während einer aktiven Phase Stand oder Zone direkt
-- (bisherige Ansichten), wird das in die Zuteilung dieser Phase übernommen.
create or replace function private.sync_active_phase_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phase uuid;
begin
  select h.current_phase_id into v_phase from public.hunts h where h.id = new.hunt_id;
  if v_phase is null then
    return null;
  end if;
  insert into public.hunt_phase_assignments (hunt_id, phase_id, participant_id, stand_id, zone_id)
  values (new.hunt_id, v_phase, new.id, new.stand_id, new.zone_id)
  on conflict (phase_id, participant_id)
  do update set stand_id = excluded.stand_id, zone_id = excluded.zone_id, updated_at = now();
  return null;
end;
$$;

revoke all on function private.sync_active_phase_assignment() from public, anon, authenticated;

create trigger hunt_participants_sync_phase
  after insert or update of stand_id, zone_id on public.hunt_participants
  for each row execute function private.sync_active_phase_assignment();
