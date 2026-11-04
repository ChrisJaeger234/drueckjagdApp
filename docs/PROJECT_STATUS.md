# Projektstatus – Drückjagd- und Reviermanagement-App

Stand: 2026-11-04 · Phase 1

## 1. Bestandsaufnahme (vor Beginn der Implementierung)

### Ausgangslage

- Das GitHub-Repository `ChrisJaeger234/drueckjagdApp` wurde geprüft: es war
  **leer** (keine Commits, keine Dateien). Es gab also keinen vorhandenen Code, der
  erhalten oder migriert werden musste.
- Es existiert **noch kein Supabase-Projekt** und es wurden keine Zugangsdaten
  bereitgestellt.
- Es gab keine vorhandenen UI-Komponenten, Designs oder Datenbankstrukturen, die
  erhalten werden mussten.

Das Projekt wurde daher mit `flutter create` neu angelegt (Plattformen iOS und Android,
Organisation `de.drueckjagd`, Paketname `drueckjagd_app`).

### Werkzeuge und Versionen

| Werkzeug | Version |
| --- | --- |
| Flutter | 3.47.9 (stable) |
| Dart | 3.13.7 |
| Supabase CLI (für lokale Entwicklung/Tests) | 3.0.0 |
| PostgreSQL (lokaler Supabase-Stack) | 17 |

### Abhängigkeiten (geprüft mit `flutter pub add`, aufgelöst gegen Dart 3.13.7)

| Paket | Version | Zweck |
| --- | --- | --- |
| supabase_flutter | ^2.18.3 | Auth, Datenbank, Realtime, Storage |
| flutter_riverpod | ^3.4.3 | State Management / Dependency Injection |
| go_router | ^18.1.2 | Navigation inkl. Auth-Guards |
| mocktail (dev) | ^1.0.5 | Test-Doubles |
| flutter_lints (dev) | ^6.0.0 | Lint-Regeln |

### Erkannte Probleme / Risiken

- Keine echten Supabase-Zugangsdaten → die App zeigt ohne Konfiguration einen klar
  gekennzeichneten Einrichtungsbildschirm und baut **keine** Scheinverbindung auf.
- Ohne verknüpftes GitHub-Konto kann der Code noch nicht hochgeladen werden.
- iOS-Builds können in dieser Linux-Umgebung nicht erzeugt werden (Xcode fehlt);
  Android- und Dart-Analyse/Tests laufen lokal.

## 2. Technische Entscheidungen (Kurzfassung)

Details in [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE.md](DATABASE.md) und
[SECURITY.md](SECURITY.md).

1. **Feature-First-Architektur** mit `data/`, `domain/`, `presentation/` pro Feature.
2. **Riverpod 3** für State und Abhängigkeiten, **GoRouter** mit `StatefulShellRoute`
   für die Hauptnavigation (Übersicht, Karte, Gruppe, Chat, Profil).
3. **Konfiguration über `--dart-define-from-file=.env`** statt eines gebündelten
   `.env`-Assets: Werte landen nicht als Datei im App-Bundle, keine zusätzliche
   Abhängigkeit.
4. **Schreibende Mitgliedschaftsoperationen ausschließlich über
   `SECURITY DEFINER`-Funktionen (RPCs)** – Gruppe anlegen, Einladung erzeugen/einlösen,
   Rollen ändern, Mitglied entfernen, Gruppe verlassen. Direkte Inserts in
   `group_members` sind per RLS verboten.
5. **Einladungscodes** werden serverseitig erzeugt, nur einmal im Klartext
   zurückgegeben und als SHA-256-Hash gespeichert.
6. **PostGIS** wird als Erweiterung aktiviert; Geometrien folgen in Phase 2. Bis dahin
   speichern `revier_boundaries` GeoJSON (`jsonb`), Wegpunkte `latitude/longitude`
   mit Wertebereichs-Constraints.
7. **Tests auf drei Ebenen**: Dart-Unit/Widget-Tests, pgTAP-Tests für RLS
   (`supabase test db`) und Integrationstests der Repositories gegen einen lokalen
   Supabase-Stack.

## 3. Fortschritt

Siehe [PHASE_1.md](PHASE_1.md) für den vollständigen Funktionsstand und den
Abschlussbericht.
