-- =============================================================================
-- 0018 – Mehrere Zonen je Teilnehmer (z. B. ein Treiber geht zwei Treiben)
--
-- Bisher hat ein Teilnehmer genau eine Zone (hunt_participants.zone_id bzw.
-- hunt_phase_assignments.zone_id). Diese bleibt die erste Zone. Weitere Zonen
-- stehen in der neuen Tabelle hunt_participant_zones:
--   phase_id null  = Jagd ohne Phasen
--   phase_id = X   = weitere Zonen in Phase X
--
-- Nur Ergänzungen: neue Tabelle mit RLS wie hunt_phase_assignments
-- (Gruppenmitglieder lesen, Jagdleitung schreibt). Bestehende Tabellen,
-- Funktionen und Daten bleiben unverändert. Ältere App-Versionen zeigen
-- weiterhin nur die erste Zone.
-- =============================================================================

create table if not exists public.hunt_participant_zones (
  id              uuid primary key default gen_random_uuid(),
  hunt_id         uuid not null references public.hunts (id) on delete cascade,
  participant_id  uuid not null,
  zone_id         uuid not null,
  phase_id        uuid,
  created_at      timestamptz not null default now(),

  constraint hunt_participant_zones_participant
    foreign key (hunt_id, participant_id) references public.hunt_participants (hunt_id, id) on delete cascade,
  constraint hunt_participant_zones_zone
    foreign key (hunt_id, zone_id) references public.hunt_zones (hunt_id, id) on delete cascade,
  constraint hunt_participant_zones_phase
    foreign key (hunt_id, phase_id) references public.hunt_phases (hunt_id, id) on delete cascade
);

-- Jede Zone höchstens einmal je Teilnehmer und Phase (auch ohne Phase).
create unique index if not exists hunt_participant_zones_unique
  on public.hunt_participant_zones (participant_id, coalesce(phase_id, '00000000-0000-0000-0000-000000000000'::uuid), zone_id);
create index if not exists hunt_participant_zones_hunt_idx on public.hunt_participant_zones (hunt_id);
create index if not exists hunt_participant_zones_zone_idx on public.hunt_participant_zones (hunt_id, zone_id);
create index if not exists hunt_participant_zones_phase_idx on public.hunt_participant_zones (hunt_id, phase_id);

comment on table public.hunt_participant_zones is
  'Weitere Zonen eines Teilnehmers (zusätzlich zu zone_id), je Phase oder ohne Phase.';

revoke all on public.hunt_participant_zones from public, anon, authenticated;
grant select, delete on public.hunt_participant_zones to authenticated;
grant insert (hunt_id, participant_id, zone_id, phase_id) on public.hunt_participant_zones to authenticated;

alter table public.hunt_participant_zones enable row level security;

drop policy if exists "hunt_participant_zones: Gruppenmitglieder lesen" on public.hunt_participant_zones;
create policy "hunt_participant_zones: Gruppenmitglieder lesen"
  on public.hunt_participant_zones for select to authenticated
  using (private.is_group_member(private.hunt_group_id(hunt_id)));

drop policy if exists "hunt_participant_zones: Jagdleitung anlegen" on public.hunt_participant_zones;
create policy "hunt_participant_zones: Jagdleitung anlegen"
  on public.hunt_participant_zones for insert to authenticated
  with check (private.can_manage_hunt(hunt_id));

drop policy if exists "hunt_participant_zones: Jagdleitung löschen" on public.hunt_participant_zones;
create policy "hunt_participant_zones: Jagdleitung löschen"
  on public.hunt_participant_zones for delete to authenticated
  using (private.can_manage_hunt(hunt_id));
