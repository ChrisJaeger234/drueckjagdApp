# Drückjagd – Jagd- und Reviermanagement-App

Private App für Jagdgruppen: Benutzerkonten, Gruppen mit Rollen, sichere
Einladungen und Reviere. Später: gemeinsame Revierkarte, Wegpunkte,
Standortfreigabe, Chat und Offline-Nutzung.

**Stack:** Flutter (iOS/Android, Material 3) · Riverpod · GoRouter ·
Supabase (Auth, PostgreSQL mit RLS, Storage, PostGIS)

## Schnellstart

```bash
cp .env.example .env          # Supabase-URL und Publishable key eintragen
flutter pub get
flutter run --dart-define-from-file=.env
```

Ohne `.env` startet die App mit dem Hinweis „Einrichtung erforderlich“.

## Dokumentation

| Dokument | Inhalt |
| --- | --- |
| [docs/SETUP.md](docs/SETUP.md) | Supabase verbinden, App starten, Tests ausführen |
| [docs/SUPABASE_CHECKLIST.md](docs/SUPABASE_CHECKLIST.md) | Checkliste: Supabase-Cloud-Projekt einrichten und `.env` verbinden |
| [docs/REVIEW_PHASE_1.md](docs/REVIEW_PHASE_1.md) | Technischer Review vor Phase 2: Befunde, Fixes, offene Punkte |
| [docs/PHASE_1.md](docs/PHASE_1.md) | Funktionsumfang, Testergebnisse, offene Punkte, Empfehlung Phase 2 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Aufbau und technische Entscheidungen |
| [docs/DATABASE.md](docs/DATABASE.md) | Tabellen, Funktionen, Migrationen |
| [docs/SECURITY.md](docs/SECURITY.md) | Rollen, RLS, Einladungscodes |
| [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) | Bestandsaufnahme und Status |

## Tests

```bash
flutter analyze
flutter test
supabase start && supabase db reset && supabase test db
```
