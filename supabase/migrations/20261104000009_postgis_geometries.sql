-- =============================================================================
-- 0009 – PostGIS-Geometrien für Reviergrenzen, Wegpunkte und Standorte
--
-- Rein additiv. Die App liest und schreibt weiterhin GeoJSON bzw.
-- latitude/longitude; die Geometrie-Spalten werden von der Datenbank gepflegt
-- und dienen räumlichen Abfragen (z. B. „liegt der Stand im Revier?“).
--
--   * revier_boundaries.geom  geometry(MultiPolygon, 4326), per Trigger aus
--     boundary_data. Akzeptiert Polygon, MultiPolygon, Feature und
--     FeatureCollection (z. B. aus einem KML-/GPX-Import). Ungültige
--     Geometrien werden repariert (ST_MakeValid); boundary_data wird danach als
--     normalisiertes GeoJSON-MultiPolygon gespeichert, damit beide Spalten
--     immer übereinstimmen.
--   * waypoints.geom / locations.geom  geography(Point, 4326), generiert aus
--     latitude/longitude.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- GeoJSON → MultiPolygon (SRID 4326)
-- Fehler: invalid_boundary (SQLSTATE 22023)
-- -----------------------------------------------------------------------------
create or replace function private.geojson_to_multipolygon(p_geojson jsonb)
returns extensions.geometry
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_parts extensions.geometry[] := '{}';
  v_item  jsonb;
  v_geom  extensions.geometry;
begin
  if p_geojson is null or jsonb_typeof(p_geojson) <> 'object' then
    raise exception 'invalid_boundary' using errcode = '22023';
  end if;

  if p_geojson ->> 'type' = 'FeatureCollection' then
    for v_item in select jsonb_array_elements(coalesce(p_geojson -> 'features', '[]'::jsonb)) loop
      if v_item -> 'geometry' is not null and jsonb_typeof(v_item -> 'geometry') = 'object' then
        v_parts := v_parts || extensions.st_geomfromgeojson(v_item -> 'geometry');
      end if;
    end loop;
  elsif p_geojson ->> 'type' = 'Feature' then
    if jsonb_typeof(p_geojson -> 'geometry') <> 'object' then
      raise exception 'invalid_boundary' using errcode = '22023';
    end if;
    v_parts := array[extensions.st_geomfromgeojson(p_geojson -> 'geometry')];
  else
    v_parts := array[extensions.st_geomfromgeojson(p_geojson)];
  end if;

  v_geom := extensions.st_collect(v_parts);
  if v_geom is null then
    raise exception 'invalid_boundary' using errcode = '22023';
  end if;

  v_geom := extensions.st_setsrid(extensions.st_force2d(v_geom), 4326);
  v_geom := extensions.st_collectionextract(extensions.st_makevalid(v_geom), 3);
  v_geom := extensions.st_multi(extensions.st_unaryunion(v_geom));

  if extensions.st_isempty(v_geom)
     or extensions.geometrytype(v_geom) <> 'MULTIPOLYGON'
     or extensions.st_npoints(v_geom) > 100000
     or extensions.st_xmin(v_geom) < -180 or extensions.st_xmax(v_geom) > 180
     or extensions.st_ymin(v_geom) < -90  or extensions.st_ymax(v_geom) > 90 then
    raise exception 'invalid_boundary' using errcode = '22023';
  end if;

  return v_geom;
exception
  when sqlstate 'XX000' or sqlstate '22023' or sqlstate '22P02' then
    -- PostGIS meldet Parserfehler als internal_error (XX000).
    raise exception 'invalid_boundary' using errcode = '22023';
end;
$$;

revoke all on function private.geojson_to_multipolygon(jsonb) from public, anon;
grant execute on function private.geojson_to_multipolygon(jsonb) to authenticated;

-- Trigger-Funktion für alle Tabellen mit boundary_data + geom.
create or replace function private.sync_boundary_geom()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.geom := private.geojson_to_multipolygon(new.boundary_data);
  new.boundary_data := extensions.st_asgeojson(new.geom, 7)::jsonb;
  return new;
end;
$$;

revoke all on function private.sync_boundary_geom() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- revier_boundaries
-- -----------------------------------------------------------------------------
alter table public.revier_boundaries
  add column geom extensions.geometry(MultiPolygon, 4326);

create trigger revier_boundaries_sync_geom
  before insert or update of boundary_data on public.revier_boundaries
  for each row execute function private.sync_boundary_geom();

-- Bestand übernehmen (löst den Trigger aus).
update public.revier_boundaries set boundary_data = boundary_data;

alter table public.revier_boundaries alter column geom set not null;

create index revier_boundaries_geom_idx on public.revier_boundaries using gist (geom);

comment on column public.revier_boundaries.geom is
  'Von der Datenbank gepflegt (Trigger aus boundary_data). Nicht direkt schreiben.';

-- -----------------------------------------------------------------------------
-- waypoints / locations
-- -----------------------------------------------------------------------------
alter table public.waypoints
  add column geom extensions.geography(Point, 4326)
  generated always as (
    extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
  ) stored;

create index waypoints_geom_idx on public.waypoints using gist (geom);

alter table public.locations
  add column geom extensions.geography(Point, 4326)
  generated always as (
    extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
  ) stored;

create index locations_geom_idx on public.locations using gist (geom);

comment on table public.revier_boundaries is
  'Reviergrenzen. boundary_data = normalisiertes GeoJSON-MultiPolygon, geom = PostGIS-Geometrie.';
