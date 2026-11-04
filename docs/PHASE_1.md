# Phase 1 – Abschlussbericht

Stand: 2026-11-04 · Branch `feature/phase-1-foundation`

## Ergebnis auf einen Blick

Phase 1 ist technisch umgesetzt und gegen einen **lokalen** Supabase-Stack
vollständig getestet (Datenbank, Berechtigungen, Repositories der App und ein
manueller Durchlauf der echten App im Browser-Build). Offen ist nur die
Verbindung mit **deinem** Supabase-Cloud-Projekt, weil noch keine Zugangsdaten
existieren. Die Schritte stehen in [SETUP.md](SETUP.md).

| Abschlusskriterium | Status | Nachweis |
| --- | --- | --- |
| App startet | ✓ | Widget-Tests; Web-Build gegen lokales Supabase |
| Registrierung | ✓ | Widget- und Integrationstests (inkl. serverseitiger Passwortregeln) |
| Anmeldung / Abmeldung | ✓ | Widget- und Integrationstests |
| Profile anlegen und bearbeiten | ✓ | Trigger + Integrationstests (inkl. doppelter Benutzername) |
| Gruppen erstellen | ✓ | RPC `create_group`, Integrationstests |
| Mitglieder zuordnen | ✓ | Einladung, Rollen ändern, entfernen, verlassen |
| Einladungen sicher | ✓ | Hash statt Klartext, Ablauf, Limit, Widerruf, Drosselung (pgTAP) |
| Reviere erstellen und Gruppen zuordnen | ✓ | Integrationstests |
| Datenbankberechtigungen | ✓ | RLS auf allen Tabellen, 57 pgTAP-Tests |
| Keine Sichtbarkeit zwischen Gruppen | ✓ | pgTAP + Integrationstests mit Außenstehendem |
| Wichtigste Tests erfolgreich | ✓ | siehe Testergebnisse |
| Dokumentation vollständig | ✓ | `docs/` |
| Verbindung zum eigenen Supabase-Projekt | offen | benötigt deine Zugangsdaten |

## Implementierte Funktionen

**Startbildschirm** – Logo/Schriftzug, Initialisierung von Supabase,
Wiederherstellung der Sitzung, Weiterleitung zur Anmeldung oder Übersicht,
Hinweis „Einrichtung erforderlich“ bei fehlender Konfiguration, Fehlerzustand mit
„Erneut versuchen“.

**Registrierung** – E-Mail, Passwort, Bestätigung, Validierung, verständliche
Fehlermeldungen, Erfolgszustand „Bitte E-Mail bestätigen“ mit „E-Mail erneut
senden“, oder direkte Anmeldung, wenn die Bestätigung deaktiviert ist.

**Anmeldung** – E-Mail/Passwort, Ladezustand, Fehlerbehandlung (u. a. falsche
Daten, unbestätigte E-Mail mit erneutem Versand), persistente Sitzung
(supabase_flutter), Abmelden mit Rückfrage.

**Profil** – Anzeigen und Bearbeiten von Anzeige- und Benutzername (eindeutig),
Hinweis zur Profilvervollständigung, Initialen-Avatar. Profilbild: Storage-Bucket
und Policies vorbereitet, Upload folgt in Phase 2 (in der App so gekennzeichnet).

**Gruppen** – Erstellen, Übersicht, Details, Bearbeiten (Owner), Löschen (Owner),
Verlassen, Mitgliederliste mit Rollen, Rollen vergeben (Owner), Mitglieder
entfernen (Owner; Admins, wenn erlaubt), Schalter „Admins dürfen Mitglieder
verwalten“.

**Einladungen** – Code erzeugen mit Gültigkeit (24 h, 7 Tage, 30 Tage) und
Nutzungslimit (1, 5, 20, unbegrenzt), einmalige Anzeige mit Kopieren-Funktion,
Liste mit Status, Widerrufen, Beitreten per Code.

**Reviere** – Anlegen (Owner/Admin), Übersicht je Gruppe und über alle Gruppen,
Details, Bearbeiten (Owner/Admin), Löschen (Owner).

**Navigation** – Übersicht, Karte, Gruppe, Chat, Profil. Karte und Chat sind als
„In Vorbereitung · Phase 2“ gekennzeichnete Vorschauen ohne funktionslose Buttons.

**Design** – eigenes Material-3-Theme (hell/dunkel) in Waldgrün, Anthrazit,
Sand- und Rindentönen; zentrale Farben, Abstände und Textstile; einheitliche
Buttons, Eingabefelder, Karten, Dialoge, Lade-, Fehler- und Leerzustände.
Screenshots: [`docs/screenshots/`](screenshots/).

## Datenbankmigrationen

1. `20261104000001_extensions_and_helpers.sql` – PostGIS, pgcrypto, `set_updated_at()`
2. `20261104000002_core_schema.sql` – alle Tabellen, Enums, Constraints, Indizes, Profil-Trigger
3. `20261104000003_rls_policies.sql` – Berechtigungsfunktionen, Rechte, RLS-Policies
4. `20261104000004_group_functions.sql` – Gruppen-, Einladungs- und Rollen-Funktionen
5. `20261104000005_storage_avatars.sql` – privater Bucket `avatars`

Details: [DATABASE.md](DATABASE.md), Berechtigungen: [SECURITY.md](SECURITY.md).

## Benötigte Umgebungsvariablen

| Variable | Pflicht | Beschreibung |
| --- | --- | --- |
| `SUPABASE_URL` | ja | `https://<project-ref>.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | ja* | Publishable key (`sb_publishable_…`) |
| `SUPABASE_ANON_KEY` | ja* | Alternative: klassischer anon-JWT |
| `AUTH_REDIRECT_URL` | nein | Standard `de.drueckjagd.app://login-callback` |

\* einer der beiden Schlüssel. Vorlage: [`.env.example`](../.env.example).

Nur für Integrationstests: `SUPABASE_TEST_URL`, `SUPABASE_TEST_KEY`.

## Testergebnisse

Ausgeführt am 2026-11-04 mit Flutter 3.47.9 / Dart 3.13.7 und Supabase CLI 3.0.0
(lokaler Stack, PostgreSQL 17):

| Prüfung | Ergebnis |
| --- | --- |
| `flutter analyze` (inkl. strict-casts, strict-raw-types) | keine Befunde |
| `flutter test` – Unit-Tests (Konfiguration, Validierung, Fehlerübersetzung, Modelle, Berechtigungen, Auth-Redirect, Auth-Controller) | 50 bestanden |
| `flutter test` – Widget-Tests (Start, Anmeldung, Registrierung, Gruppe + Revier anlegen, Member-Ansicht, Profil + Abmelden, Beitritt per Code) | 7 bestanden |
| `supabase test db` – pgTAP (RLS, Funktionen, Einladungen) | 57 bestanden |
| `flutter test test/integration` gegen lokales Supabase | 12 bestanden |
| Manueller Durchlauf (Web-Build gegen lokales Supabase): Registrierung → Übersicht → Gruppe erstellen → Einladungscode | erfolgreich |

Ohne Backend-Variablen meldet `flutter test` die 12 Integrationstests als
übersprungen (mit Begründung), alle übrigen laufen.

Nicht ausgeführt (fehlende Werkzeuge in der Arbeitsumgebung): Android- und
iOS-Builds auf Gerät/Emulator. Der Dart-Code ist plattformunabhängig; die
Plattformkonfiguration (Internet-Berechtigung, Deeplink-Schema, App-Name) wurde
angepasst, aber nicht auf einem Gerät verifiziert.

## Noch offene Punkte

1. **Supabase-Cloud-Projekt verbinden** (siehe unten) – erst danach funktioniert
   die App außerhalb der lokalen Entwicklungsumgebung.
2. **Test auf echten Geräten** (iOS und Android), insbesondere der
   Bestätigungslink aus der E-Mail (Deeplink).
3. **Store-Vorbereitung**: endgültige Bundle-ID/Application-ID, App-Icon,
   Android-Signing, Datenschutzerklärung.
4. **Profilbild-Upload** (Bucket vorbereitet) – geplant für Phase 2.
5. **Passwort vergessen** war nicht Teil des Phase-1-Umfangs; empfohlen als
   erster Punkt in Phase 2.
6. **Benutzerkonto löschen** (DSGVO) – empfohlen für Phase 2 über eine Edge Function.
7. Löscht ein Benutzer sein Konto als letzter Owner, bleibt die Gruppe ohne
   Owner bestehen. Eine automatische Übergabe sollte mit der Kontolöschung
   umgesetzt werden.
8. Im Web-Build trat bei automatisierter Bedienung ein Fokusfehler im
   Flutter-Framework auf (`ReadingOrderTraversalPolicy`). Er betrifft nur die
   Web-Plattform, die nicht zum Ziel gehört, und stammt nicht aus dem App-Code.

## Manuelle Konfigurationsschritte für dich

1. Supabase-Projekt anlegen und `supabase db push` ausführen.
2. E-Mail-Bestätigung aktivieren, Passwortregeln setzen (min. 8, Buchstaben + Ziffern).
3. Redirect-URL `de.drueckjagd.app://login-callback` eintragen.
4. Eigenen SMTP-Server hinterlegen.
5. `.env` aus `.env.example` erstellen, URL und Publishable key eintragen.
6. `flutter run --dart-define-from-file=.env` auf einem Gerät ausführen.

Ausführlich: [SETUP.md](SETUP.md).

## Empfehlung für Phase 2

Reihenfolge nach Nutzen für den Jagdtag und technischer Abhängigkeit:

1. **Passwort vergessen, Profilbild, Konto löschen** – kleine Lücken schließen.
2. **Kartenbasis**: Mapbox SDK, Revierliste → Karte, Reviergrenzen als PostGIS-Geometrie
   (Migration: `geometry`-Spalte + GiST-Index), KML-/GPX-Import.
3. **Wegpunkte / jagdliche Einrichtungen** auf der Karte (Tabelle + RLS existieren).
4. **Lokale Speicherung mit Drift** hinter den bestehenden Repository-Schnittstellen,
   danach Offline-Karten und Synchronisierung.
5. **GPS und Live-Standortfreigabe** mit ausdrücklicher Zustimmung pro Gruppe/Jagdtag
   (neue Tabelle für Freigaben, RLS für `locations` erweitern), Realtime.
6. **Chat und Schnellmeldungen** („erlegt“, „angeschossen“, „Nachsuche“) mit Realtime
   und Push (FCM/APNs über Edge Function).
