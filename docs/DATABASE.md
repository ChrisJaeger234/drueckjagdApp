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

### revier_boundaries (vorbereitet)
`revier_id` (FK, `CASCADE`), `boundary_data jsonb` (GeoJSON-Objekt mit `type`).
In Phase 2 kommt eine Spalte `geometry(MultiPolygon, 4326)` mit GiST-Index dazu.

> Hinweis: Im Auftrag stand `revir_boundaries` – das wurde als Tippfehler
> gewertet und die Tabelle konsistent `revier_boundaries` genannt.

### waypoints (vorbereitet)
`revier_id`, `created_by`, `name`, `description`, `category`
(`hochsitz`, `kanzel`, `kirrung`, `fuetterung`, `wildkamera`, `weg`, `gefahr`,
`sonstiges`), `latitude` (−90…90), `longitude` (−180…180), Zeitstempel.

### locations (vorbereitet)
`user_id`, `group_id`, `latitude`, `longitude`, `accuracy` (≥ 0), `recorded_at`.
Indizes auf `(group_id, recorded_at desc)` und `(user_id, recorded_at desc)`.

### messages (vorbereitet)
`group_id`, `sender_id` (`SET NULL`, Nachricht bleibt erhalten), `content`
(1–4000 Zeichen), `created_at`. Index `(group_id, created_at desc)`.

## Löschregeln

- Benutzer löschen → Profil, Mitgliedschaften, eigene Standorte werden gelöscht;
  in Gruppen, Revieren, Wegpunkten und Nachrichten wird der Verweis auf `NULL` gesetzt.
- Gruppe löschen → Mitgliedschaften, Einladungen, Reviere (inkl. Grenzen und
  Wegpunkte), Standorte und Nachrichten der Gruppe werden gelöscht.
- Revier löschen → Grenzen und Wegpunkte werden gelöscht.
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
`use_leave_group`, `invalid_validity`, `invalid_max_uses`) und in der App in
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
