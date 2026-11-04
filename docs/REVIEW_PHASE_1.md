# Technischer Review Phase 1 (PR #1)

Stand: 2026-11-04 · geprüfter Branch `feature/phase-1-foundation` (Commit `4995c4a`)

## Einschätzung

**Phase 1 ist technisch bereit für Phase 2**, sobald die Härtungs-Migration 0006
(dieser Review) übernommen ist und das Cloud-Projekt nach
[SUPABASE_CHECKLIST.md](SUPABASE_CHECKLIST.md) eingerichtet wurde. Es wurden keine
Lücken gefunden, über die Benutzer auf fremde Gruppen, Reviere, Einladungen,
Profile, Standorte oder Nachrichten zugreifen können. Die gefundenen Fehler betrafen
Randfälle (gleichzeitige Änderungen, Kontolöschung), nicht die Zugriffsregeln selbst.

## Wie geprüft wurde

- Alle Migrationen auf einer frischen PostgreSQL-16-Datenbank mit PostGIS, pgcrypto,
  pgTAP und nachgebildeten Supabase-Schemas (`auth`, `storage`, Rollen `anon` /
  `authenticated`, Standard-Rechte wie in der Cloud) der Reihe nach eingespielt.
- Bestehende pgTAP-Suite: **57/57 bestanden**.
- Zusätzliche Angriffsversuche als fremder Benutzer, Member und Admin
  (fremdes Profil anlegen, Nachricht im Namen anderer, Upload in fremden
  Avatar-Ordner, interne Funktionen per RPC, Gruppe/Revier löschen mit `RETURNING`).
- Gleichzeitige Aufrufe mit zwei Datenbankverbindungen nachgestellt.
- Neue Suite `review_hardening.test.sql`: **16/16 bestanden** (gesamt 73).
- Dart-Code gelesen (Auth, Router, Repositories, Konfiguration, Deeplinks).
  `flutter analyze` / `flutter test` konnten in dieser Umgebung nicht laufen (kein
  Flutter SDK); am Dart-Code wurde nichts geändert.

## Antworten auf die Prüffragen

| Frage | Ergebnis |
| --- | --- |
| Migrationen vollständig und in richtiger Reihenfolge? | Ja. 0001 → 0005 laufen fehlerfrei nacheinander; jede Migration nutzt nur Objekte aus früheren. 0006 ergänzt rein additiv. |
| RLS sicher, Gruppenrechte wirksam? | Ja. RLS auf allen 10 Tabellen, `anon` ohne Tabellenrechte, Spaltenrechte verhindern das Umhängen von `group_id`, Mitgliedschaften nur über geprüfte RPCs. |
| Unberechtigter Zugriff auf fremde Gruppen/Reviere/Einladungen? | Nicht möglich. Einladungen sind nur für Owner bzw. freigegebene Admins lesbar, der Code-Hash für niemanden; Codes haben 60 Bit Zufall, Fehlversuche werden gedrosselt. |
| Auth und E-Mail-Bestätigung korrekt? | Ja. PKCE-Flow, Deeplink `de.drueckjagd.app://login-callback` in Android und iOS registriert, „E-Mail nicht bestätigt“ wird erkannt und bietet erneuten Versand. Voraussetzung: „Confirm email“ ist im Cloud-Projekt eingeschaltet (lokal bewusst aus). |
| Fehler / technische Schulden vor Phase 2? | Siehe unten: 4 behoben, Rest als Aufgaben für Phase 2 gelistet. |
| Architektur bereit für Mapbox, PostGIS, GPS, Drift? | Ja, mit den unten genannten Schritten. Repository-Schnittstellen erlauben eine lokale Drift-Quelle ohne Umbau. |

## Behoben in Migration 0006

1. **Gruppe ohne Owner durch gleichzeitiges Herabstufen** – nachgestellt: zwei
   Owner stufen sich gleichzeitig gegenseitig herab, danach hatte die Gruppe
   **keinen** Owner mehr (niemand kann mehr einladen, umbenennen oder löschen).
   Jetzt sperren `set_group_member_role`, `remove_group_member` und `leave_group`
   zuerst die Gruppenzeile und prüfen danach. Mit 0006 bleibt genau ein Owner.
2. **Gruppe ohne Owner nach Kontolöschung** – wird das Konto des einzigen Owners
   gelöscht, griff keine Prüfung. Jetzt wird automatisch das dienstälteste Mitglied
   (Admins zuerst) Owner; ist niemand mehr übrig, wird die leere Gruppe gelöscht.
3. **Einladung einlösen bei parallelen Aufrufen** – Doppeltipp konnte einen
   Unique-Fehler auslösen und die Drosselung ließ sich durch parallele Anfragen
   umgehen. Jetzt pro Benutzer serialisiert, `ON CONFLICT DO NOTHING`, Nutzungen
   werden nur bei echtem Beitritt gezählt. Fehlversuche älter als ein Tag werden
   aufgeräumt (die Tabelle wuchs vorher unbegrenzt).
4. **Standardwerte und Indizes** – `created_by`, `sender_id`, `user_id` haben jetzt
   `auth.uid()` als Standard (die Policies prüfen weiterhin auf Fälschung);
   fehlende Indizes auf `created_by`/`sender_id` ergänzt.

## Offene Punkte (nicht blockierend, vor oder in Phase 2 einplanen)

**Vor echten Nutzern**
- „Passwort vergessen“ fehlt (Supabase `resetPasswordForEmail` + Deeplink-Ziel).
- Konto löschen in der App fehlt. Apple verlangt das für Apps mit Registrierung
  (App Review 5.1.1(v)); serverseitig ist das Löschen nach 0006 sauber abgesichert,
  braucht aber eine Edge Function, weil der Client `auth.users` nicht löschen darf.
- Keine CI: ein GitHub-Actions-Workflow mit `flutter analyze`, `flutter test` und
  `supabase test db` würde jede Änderung automatisch prüfen.

**Fachmodell für Phase 2**
- Es gibt noch keine Entität für die **Jagd selbst** (Termin, Treiben, Standzuteilung
  Schütze ↔ Stand, Treibergruppen, Zonen) und keine strukturierten **Meldungen**
  (erlegt / angeschossen / gefehlt mit Wildart, Ort, Zeit). `messages` ist reiner
  Freitext. Beides passt als neue Tabellen unter `groups`/`reviere`, ohne
  Bestehendes umzubauen.
- Rollen sind gruppenweit (owner/admin/member). Jagdrollen wie Schütze, Treiber,
  Hundeführer, Jagdleiter gehören an die Teilnahme an einer Jagd, nicht an die Gruppe.

**PostGIS / Karte**
- `waypoints` und `locations` speichern `latitude`/`longitude`, `revier_boundaries`
  GeoJSON. Empfehlung: per neuer Migration generierte Spalten
  `geography(Point, 4326)` bzw. `geometry(MultiPolygon, 4326)` mit GiST-Index
  ergänzen, damit Bestandsdaten und App-Code unverändert bleiben.
- Mapbox-Token kommt als weiterer Eintrag in `.env` (`MAPBOX_ACCESS_TOKEN`, nur
  öffentlicher `pk.`-Token) und wird wie die Supabase-Werte über Dart-Defines gelesen.

**GPS im Hintergrund**
- Noch keine Berechtigungen in `AndroidManifest.xml` / `Info.plist` (richtig für
  Phase 1). Benötigt: `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`,
  `FOREGROUND_SERVICE_LOCATION`; iOS `UIBackgroundModes: location` und die
  `NSLocation…UsageDescription`-Texte.
- `locations` ist heute nur für den Eigentümer lesbar. Für die Live-Karte eine
  Freigabe-Policy „Mitglieder derselben laufenden Jagd“ ergänzen, dazu eine
  Tabelle „letzte Position je Benutzer“ (statt die Historie abzufragen) und eine
  Aufbewahrungsfrist (DSGVO, z. B. Löschen 24 h nach Jagdende).
- Realtime: `messages` / `locations` zur Publication `supabase_realtime` hinzufügen.

**Offline / SQLite (Drift)**
- Gut vorbereitet: Clients dürfen eigene UUIDs vergeben, dadurch sind Offline-Inserts
  idempotent.
- Für Delta-Sync fehlen noch `updated_at` auf `messages` und weichen Löschungen
  (`deleted_at`) auf synchronisierten Tabellen, damit Löschungen auf andere Geräte
  übertragen werden.

**Kleinigkeiten**
- Ein zum Member herabgestufter Admin darf eigene Wegpunkte weiter bearbeiten und
  löschen (Policy „Ersteller“). Bewusst so lassen oder in Phase 2 entscheiden.
- `supabase/config.toml`: lokal ist die E-Mail-Bestätigung aus. Das ist für
  Entwicklung gewollt, muss aber in der Cloud an sein (Checkliste Abschnitt C).
