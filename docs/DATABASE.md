# Datenbank

Alle Änderungen liegen als SQL-Migrationen in `supabase/migrations/` und werden
in Dateinamensreihenfolge ausgeführt.

| Migration | Inhalt |
| --- | --- |
| `20261104000001_extensions_and_helpers.sql` | PostGIS, pgcrypto, Trigger-Funktion `set_updated_at()` |
| `20261104000002_core_schema.sql` | Enums, alle Tabellen, Indizes, Constraints, Trigger für neue Benutzer |
| `20261104000003_rls_policies.sql` | Schema `private` mit Berechtigungsfunktionen, Rechte, RLS-Policies |
| `20261104000004_group_functions.sql` | RPCs für Gruppen, Einladungen, Rollen, Mitglieder |
| `20261104000005_storage_avatars.sql` | Privater Storage-Bucket `avatars` mit Policies |
| `20261104000006_review_hardening.sql` | Härtung nach Review: Sperren gegen Owner-Race-Conditions, robustes Einlösen, automatischer Owner-Nachfolger bei Kontolöschung, Standardwerte `auth.uid()`, FK-Indizes |
| `20261104000007_rls_security_test_fixes.sql` | Fixes aus dem Sicherheitstest: entfernte Mitglieder können ältere Einladungscodes nicht mehr nutzen (`group_member_removals`), `remove_group_member` verrät keine Mitgliedschaften |
| `20261104000008_waypoint_categories.sql` | Neue Einrichtungs-Kategorien (Drückjagdbock, Ansitzleiter, Salzlecke, Suhle, Wildacker, Sammelplatz, Parkplatz) |
| `20261104000009_postgis_geometries.sql` | PostGIS-Spalten `geom` für Reviergrenzen (MultiPolygon, per Trigger aus GeoJSON), Wegpunkte und Standorte (Punkt, generiert), GiST-Indizes |
| `20261104000010_hunts.sql` | Jagden: `hunts`, `hunt_zones`, `hunt_stands`, `hunt_participants`, `hunt_reports` mit RLS, Integritäts-Triggern und Berechtigungsfunktionen |

## Tabellen

Alle Primärschlüssel sind UUIDs (`gen_random_uuid()`), alle Zeitstempel
`timestamptz`. `updated_at` wird per Trigger gepflegt.

### profiles
| Spalte | Typ | Hinweise |
| --- | --- | --- |
| id | uuid PK | FK → `auth.users.id`, `ON DELETE CASCADE` |
| username | text, eindeutig | `^[a-z0-9_]{3,24}$`, optional bis zur Vervollständigung |
| display_name | text | max. 60 Zeichen |
| avatar_url | text | Pfad im Bucket `avatars` |
| created_at, updated_at | timestamptz | |

Wird bei der Registrierung automatisch durch den Trigger `on_auth_user_created` angelegt.

### groups
| Spalte | Typ | Hinweise |
| --- | --- | --- |
| id | uuid PK | |
| name | text | 2–80 Zeichen |
| description | text | max. 1000 |
| created_by | uuid | FK → profiles, `ON DELETE SET NULL` |
| admins_can_manage_members | boolean | Owner steuert, ob Admins einladen/entfernen dürfen |
| created_at, updated_at | timestamptz | |

### group_members
| Spalte | Typ | Hinweise |
| --- | --- | --- |
| id | uuid PK | |
| group_id | uuid | FK → groups, `CASCADE` |
| user_id | uuid | FK → profiles, `CASCADE` |
| role | `group_role` | `owner`, `admin`, `member` |
| joined_at | timestamptz | |

Eindeutig: `(group_id, user_id)`. Index auf `user_id`.

### group_invites
| Spalte | Typ | Hinweise |
| --- | --- | --- |
| id | uuid PK | |
| group_id | uuid | FK → groups, `CASCADE` |
| code_hash | bytea, eindeutig | SHA-256 des normalisierten Codes, für Clients nicht lesbar |
| created_by | uuid | FK → profiles, `SET NULL` |
| expires_at | timestamptz, optional | |
| max_uses | int, optional | > 0 |
| use_count | int | ≤ max_uses |
| revoked_at | timestamptz, optional | |

### group_invite_attempts
Protokoll fehlgeschlagener Einlöseversuche (Drosselung: 10 in 15 Minuten).
Kein Clientzugriff.

### reviere
| Spalte | Typ | Hinweise |
| --- | --- | --- |
| id | uuid PK | |
| name | text | 2–120 Zeichen, eindeutig je Gruppe (ohne Groß-/Kleinschreibung) |
| description | text | max. 2000 |
| group_id | uuid | FK → groups, `CASCADE` – mehrere Reviere pro Gruppe |
| created_by | uuid | FK → profiles, `SET NULL` |
| created_at, updated_at | timestamptz | |

### revier_boundaries
`revier_id` (FK, `CASCADE`), `boundary_data jsonb`, `geom geometry(MultiPolygon, 4326)`.

Seit 0009 setzt der Trigger `revier_boundaries_sync_geom` bei jedem Speichern
`geom` aus `boundary_data` und schreibt `boundary_data` als normalisiertes
GeoJSON-MultiPolygon zurück (7 Nachkommastellen ≈ 1 cm). Angenommen werden
`Polygon`, `MultiPolygon`, `Feature` und `FeatureCollection` (Nicht-Flächen
werden ignoriert, mehrere Flächen vereinigt). Ungültige Geometrien werden mit
`ST_MakeValid` repariert. Abgelehnt (`invalid_boundary`) werden leere Flächen,
Koordinaten außerhalb von WGS84 und mehr als 100 000 Punkte.

> Hinweis: Im Auftrag stand `revir_boundaries` – das wurde als Tippfehler
> gewertet und die Tabelle konsistent `revier_boundaries` genannt.

### waypoints (vorbereitet)
`revier_id`, `created_by`, `name`, `description`, `category`
(`hochsitz`, `kanzel`, `kirrung`, `fuetterung`, `wildkamera`, `weg`, `gefahr`,
`sonstiges`; seit 0008 zusätzlich `drueckjagdbock`, `ansitzleiter`, `salzlecke`,
`suhle`, `wildacker`, `sammelplatz`, `parkplatz`), `latitude` (−90…90),
`longitude` (−180…180), `geom geography(Point, 4326)` (generiert), Zeitstempel.

### locations (vorbereitet)
`user_id`, `group_id`, `latitude`, `longitude`, `accuracy` (≥ 0), `recorded_at`.
Indizes auf `(group_id, recorded_at desc)` und `(user_id, recorded_at desc)`.

### hunts
Jagd einer Gruppe. `group_id`, `revier_id` (optional; muss zur selben Gruppe
gehören – zusammengesetzter Fremdschlüssel, wird beim Löschen des Reviers
`NULL`), `title` (2–120), `description`, `starts_at`, `ends_at` (> Beginn),
`status` (`geplant`, `laufend`, `beendet`, `abgesagt`), `meeting_point`,
`meeting_latitude`/`meeting_longitude` (beide oder keine), `game_release`
(Freigabe), `safety_notes`, `emergency_info`, `self_join` (Standard `true`),
`created_by` (Standard `auth.uid()`). Index `(group_id, starts_at desc)`.

Trigger `hunts_add_creator`: Wer die Jagd anlegt, wird Teilnehmer mit Rolle
`jagdleiter`.

### hunt_zones
Flächen einer Jagd: `name`, `kind` (`treiben`, `sicherheitszone`, `sperrzone`,
`sammelplatz`, `sonstiges`), `description`, `color` (`#RRGGBB`),
`boundary_data` + `geom` (wie `revier_boundaries`).

### hunt_stands
Stände einer Jagd: `label` (eindeutig je Jagd, ohne Groß-/Kleinschreibung),
`waypoint_id` (optional, muss zur Gruppe gehören → sonst `waypoint_not_in_group`),
`zone_id` (Zone derselben Jagd), `latitude`, `longitude`, `geom` (generiert),
`description` (z. B. Schussrichtung), `sort_order`.

### hunt_participants
`hunt_id`, `user_id` (Standard `auth.uid()`), `role` (`jagdleiter`, `ansteller`,
`schuetze`, `treiber`, `hundefuehrer`, `bergung`, `sonstige`), `stand_id` und
`zone_id` (nur aus derselben Jagd, zusammengesetzte Fremdschlüssel; beim Löschen
des Stands/der Zone `NULL`), `note`. Eindeutig: `(hunt_id, user_id)`.

Trigger `hunt_participants_guard` (siehe SECURITY.md) prüft Mitgliedschaft,
Leitungsrollen und Zuteilungen. Trigger `group_members_remove_hunt_participation`
entfernt Teilnahmen, wenn jemand die Gruppe verlässt.

### hunt_reports
`hunt_id`, `reporter_id` (Standard `auth.uid()`), `kind` (`erlegt`,
`angeschossen`, `ueberschossen`, `anblick`, `sonstiges`), `species` (frei, max.
60), `count` (1–100), `stand_id` (derselben Jagd), `latitude`/`longitude`
(optional, beide oder keine) + `geom`, `note`, `occurred_at`, `resolved_at`,
`resolved_by` (vom Server gesetzt, nicht beschreibbar).

### messages (vorbereitet)
`group_id`, `sender_id` (`SET NULL`, Nachricht bleibt erhalten), `content`
(1–4000 Zeichen), `created_at`. Index `(group_id, created_at desc)`.

## Löschregeln

- Benutzer löschen → Profil, Mitgliedschaften, eigene Standorte werden gelöscht;
  in Gruppen, Revieren, Wegpunkten und Nachrichten wird der Verweis auf `NULL` gesetzt.
- Gruppe löschen → Mitgliedschaften, Einladungen, Reviere (inkl. Grenzen und
  Wegpunkte), Standorte und Nachrichten der Gruppe werden gelöscht.
- Revier löschen → Grenzen und Wegpunkte werden gelöscht; Jagden bleiben,
  ihr `revier_id` wird `NULL`; Stände verlieren die Verknüpfung zur Einrichtung.
- Jagd löschen → Zonen, Stände, Teilnehmer und Meldungen werden gelöscht.
- Mitglied verlässt die Gruppe → seine Teilnahmen an deren Jagden werden
  gelöscht, seine Meldungen bleiben erhalten.
- Konto des letzten Owners gelöscht → das dienstälteste Mitglied (Admins zuerst)
  wird automatisch Owner; ist niemand mehr übrig, wird die leere Gruppe gelöscht
  (Trigger `group_members_ensure_owner`, Migration 0006).

## Funktionen (RPC)

| Funktion | Wer | Beschreibung |
| --- | --- | --- |
| `create_group(p_name, p_description)` | angemeldet | Legt Gruppe an, Aufrufer wird Owner |
| `create_group_invite(p_group_id, p_valid_hours = 168, p_max_uses = null)` | Owner; Admin mit Freigabe | Liefert `invite_id`, Klartext-`code` (einmalig) und `expires_at` |
| `redeem_group_invite(p_code)` | angemeldet | Tritt als `member` bei; `NULL` bei ungültigem Code |
| `revoke_group_invite(p_invite_id)` | Owner; Admin mit Freigabe | Widerruft eine Einladung |
| `set_group_member_role(p_group_id, p_user_id, p_role)` | Owner | Rollen ändern; letzter Owner kann nicht herabgestuft werden |
| `remove_group_member(p_group_id, p_user_id)` | Owner; Admin mit Freigabe (nur `member`) | Mitglied entfernen |
| `leave_group(p_group_id)` | Mitglied | Gruppe verlassen; letzter Owner wird abgewiesen |

Rollen ändern, Mitglieder entfernen und Gruppe verlassen sperren zuerst die
Gruppenzeile (`private.lock_group`). Parallele Aufrufe laufen dadurch je Gruppe
nacheinander, sodass eine Gruppe nie versehentlich ohne Owner bleibt.
`created_by` (Reviere, Wegpunkte), `sender_id` (Nachrichten) und `user_id`
(Standorte) haben den Standardwert `auth.uid()`; die Policies prüfen weiterhin,
dass kein anderer Benutzer eingetragen wird.

Fehler werden als stabile Schlüssel gemeldet (`not_authenticated`,
`not_authorized`, `last_owner`, `member_not_found`, `too_many_attempts`,
`use_leave_group`, `invalid_validity`, `invalid_max_uses`; seit Phase 2
`invalid_boundary`, `not_a_group_member`, `waypoint_not_in_group`) und in der App in
deutsche Texte übersetzt (`ErrorMapper`).

## Migrationen ausführen

Lokal:

```bash
supabase start          # startet den lokalen Stack (Docker)
supabase db reset       # spielt alle Migrationen neu ein
supabase test db        # pgTAP-Tests
```

Gegen das Cloud-Projekt:

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase db push        # wendet neue Migrationen an
```

Neue Änderungen immer als neue Migration anlegen
(`supabase migration new <name>`), bestehende Migrationen nie nachträglich ändern,
sobald sie produktiv eingespielt wurden.
