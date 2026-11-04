# Architektur

## Überblick

```
Flutter-App (iOS/Android)
 ├─ Presentation  Widgets + Riverpod-Provider/-Controller
 ├─ Domain        Modelle, Repository-Schnittstellen, Berechtigungslogik
 └─ Data          Supabase-Implementierungen der Repositories
                    │  HTTPS (PostgREST, GoTrue, Storage)
Supabase           ▼
 ├─ Auth          E-Mail + Passwort, E-Mail-Bestätigung (konfigurierbar)
 ├─ PostgreSQL    Tabellen, RLS-Policies, SECURITY-DEFINER-Funktionen
 ├─ PostGIS       Geometrien für Grenzen, Zonen, Einrichtungen, Stände (ab 0009)
 └─ Storage       privater Bucket „avatars“ (vorbereitet)
```

Die Sicherheitsregeln liegen **ausschließlich in der Datenbank** (RLS und
Funktionen). Die App blendet Bedienelemente anhand derselben Regeln nur aus,
um keine Aktionen anzubieten, die der Server ohnehin ablehnen würde.

## Projektstruktur

```
lib/
  main.dart                      ProviderScope + App
  app/
    app.dart                     MaterialApp.router, Themes, Lokalisierung (de)
    config/app_config.dart       Dart-Defines lesen und validieren
    router/                      GoRouter, Routen, Auth-Redirect, Shell (Bottom-Navigation)
    theme/                       Farben, Abstände, Light/Dark-Theme (Material 3)
  core/
    constants/                   App-weite Konstanten
    errors/                      AppException + ErrorMapper (zentral, deutsch)
    services/supabase_service.dart  Konfiguration, Start, Supabase-Client-Provider
    utils/                       Validatoren, Formatierung
    widgets/                     Buttons, Eingabefelder, Lade-/Fehler-/Leerzustände,
                                 Karten, Dialoge, Logo, Vorschau-Ansicht
  features/
    authentication/              Start, Anmeldung, Registrierung, Auth-Status
    profile/                     Profil anzeigen/bearbeiten
    groups/                      Gruppen, Mitglieder, Rollen, Einladungen
    hunting_grounds/             Reviere
    hunts/                       Jagden, Teilnehmer, Zonen, Stände, Meldungen (Phase 2)
    overview/                    Übersicht (Dashboard)
    map/                         Phase 1: Vorschau + Wegpunkt-Kategorien (Domain)
    chat/                        Phase 1: Vorschau
test/
  unit/  widget/  integration/  support/
supabase/
  config.toml                    lokale Supabase-Konfiguration
  migrations/                    SQL-Migrationen (chronologisch)
  tests/database/                pgTAP-Tests für RLS und Funktionen
```

Jedes Feature folgt `data/ → domain/ ← presentation/`:

- **domain/** enthält reine Dart-Klassen (Modelle mit `fromJson`,
  Repository-Schnittstellen, `GroupPermissions`). Keine Flutter- oder
  Supabase-Abhängigkeit, außer bei Icons in Enums.
- **data/** implementiert die Schnittstellen mit Supabase. Jede Methode läuft
  über `guard()`, das alle Fehler in `AppException` übersetzt.
- **presentation/** enthält Screens, Widgets und Provider. Widgets greifen nie
  direkt auf Supabase zu, sondern nur über Repository-Provider.

Bewusst gibt es (noch) keine separate „Use-Case“-Schicht: Die Logik ist in
Phase 1 schlank, und Berechtigungen werden serverseitig erzwungen. Sobald
Offline-Synchronisierung hinzukommt (Phase 2), wird zwischen Repository und
Datenquelle eine lokale Quelle (Drift) eingezogen – die Schnittstellen bleiben
gleich.

## Zentrale Entscheidungen

| Thema | Entscheidung | Begründung |
| --- | --- | --- |
| State Management | Riverpod 3 (`Provider`, `FutureProvider.autoDispose.family`, `AsyncNotifier`) | Typsicher, testbar über Overrides, kein Codegen nötig |
| Navigation | GoRouter mit `StatefulShellRoute.indexedStack` | Jeder Tab behält seinen Navigationsstapel; Auth-Guard über `redirect` |
| Auth-Redirect | Reine Funktion `authRedirect()` | Ohne Widgets testbar |
| Konfiguration | `--dart-define-from-file=.env` | Kein gebündeltes `.env`-Asset, keine Extra-Abhängigkeit, Werte nicht im Repo |
| Start ohne Konfiguration | Einrichtungsbildschirm statt Fake-Backend | Keine vorgetäuschten Verbindungen |
| Schutz vor Secret-Keys | `AppConfig.isPrivilegedKey` verweigert `sb_secret_…` und `service_role`-JWTs | Service-Keys dürfen nie in die App |
| Auth-Flow | PKCE | Empfohlener Flow für mobile Apps |
| Mitgliedschaften | Nur über SQL-Funktionen | Rollenregeln an einer Stelle, atomar |
| Einladungscodes | 60 Bit Zufall, Crockford-Base32, nur SHA-256 gespeichert | Schwer erratbar, gut abtippbar, kein Klartext in der DB |
| Fehlerbehandlung | `ErrorMapper` übersetzt Auth-, PostgREST- und Netzwerkfehler | Einheitliche deutsche Meldungen |
| Riverpod-Retry | global deaktiviert | Benutzer entscheidet per „Erneut versuchen“ bzw. Pull-to-Refresh |
| Sprache | Deutsch (`flutter_localizations`, Locale `de`) | Zielgruppe |

## Datenfluss am Beispiel „Gruppe erstellen“

1. `CreateGroupScreen` validiert das Formular (`Validators.groupName`).
2. Aufruf `groupsRepositoryProvider.createGroup()`.
3. `SupabaseGroupsRepository` ruft die RPC `create_group` auf.
4. Die Datenbank legt Gruppe **und** Owner-Mitgliedschaft in einer Transaktion an.
5. Der Screen invalidiert `myGroupsProvider`; Übersicht und Gruppenliste laden neu.
6. Fehler kommen als `AppException` an und werden als SnackBar gezeigt.

## Vorbereitung für Phase 2

| Funktion | Ansatzpunkt |
| --- | --- |
| Mapbox / Offline-Karten | Feature `map/` (data/domain/presentation); Tab „Karte“ existiert bereits |
| Reviergrenzen, KML/GPX | Tabelle `revier_boundaries` (GeoJSON), PostGIS aktiviert; Spalte `geometry` per Migration ergänzen |
| Wegpunkte | Tabelle `waypoints` + RLS, Enum `WaypointCategory` in der App |
| GPS / Live-Standort | Tabelle `locations` + RLS (aktuell nur eigene Daten); neues Feature `location/` |
| Hintergrund-Standort | Eigener Service in `core/services/`, hinter einer Schnittstelle |
| SQLite / Drift | Neue lokale Datenquelle hinter den bestehenden Repository-Schnittstellen; Feature `offline/` für Sync-Queue |
| Realtime | `messages`/`locations` zur Publication `supabase_realtime` hinzufügen; Repositories um `Stream`-Methoden erweitern |
| Push | FCM/APNs-Token-Tabelle + Edge Function; Abhängigkeit nur in `core/services/` |
| Chat | Tabelle `messages` + RLS vorhanden; Feature `chat/` |
| Profilbilder | Bucket `avatars` + Policies vorhanden; `image_picker` + Upload im Profil-Repository |

Die Ordner `location/` und `offline/` wurden noch nicht angelegt, weil leere
Ordner in Git nicht versioniert werden und noch kein Code dafür existiert.
