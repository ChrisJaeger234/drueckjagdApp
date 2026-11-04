# Phase 2 – Plan und Stand

Stand: 2026-11-04

## Ziel

Die App wird zum Werkzeug für den Jagdtag: Der Jagdleiter plant eine
Drückjagd auf der Karte (Treiben, Sicherheitszonen, Stände), Teilnehmer
tragen sich selbst ein und sehen sofort alles, was für sie wichtig ist
(Treffpunkt, Freigabe, Sicherheitshinweise, ihr Stand), und Schützen melden
mit einem Tipp „erlegt“, „angeschossen“ oder „überschossen“.

Leitlinie wie gewünscht: **wenige organisatorische Hürden**. Gruppenmitglieder
dürfen sich selbst eintragen und selbst melden. Eingeschränkt ist nur, was die
Sicherheit betrifft: Stände und Zonen teilt die Jagdleitung zu, und niemand kann
sich selbst zum Jagdleiter machen.

## Aufteilung in kleine Pull Requests

Jeder PR ist für sich prüfbar, bringt Migration + RLS-Tests + Doku mit und wird
erst nach deinem OK gemergt.

| # | Inhalt | Abhängig von | Status |
| --- | --- | --- | --- |
| 1 | **Fachmodell Jagd + PostGIS**: Migrationen 0008–0010, pgTAP-Tests, Dart-Modelle, Repository, Berechtigungslogik | – | gemergt (#4), Migrationen eingespielt |
| 2 | **Jagd-Oberfläche**: Jagden-Liste in Übersicht/Gruppe, Jagd anlegen/bearbeiten, „Ich bin dabei“ mit Rolle, Teilnehmerliste, Stände als Liste anlegen und zuteilen, „Mein Stand“, Schnellmeldungen und Meldungsliste mit offener Nachsuche | 1 | zur Prüfung |
| 3 | **Karte**: Mapbox-Karte im Tab „Karte“, Reviergrenzen, Einrichtungen (Wegpunkte) anzeigen/anlegen per Langdruck, Zonen und Stände der Jagd, eigener GPS-Standort | 1, Mapbox-Token | Token liegt vor |
| 4 | **Import**: KML/KMZ (z. B. Export aus Google My Maps) und GPX → Reviergrenzen und Einrichtungen, Vorschau vor dem Speichern | 3 | |
| 5 | **Live während der Jagd**: Realtime für Meldungen und Teilnehmer, Push-Benachrichtigung bei neuen Meldungen (FCM/APNs über Edge Function) | 2 | |
| 6 | **Live-Standort** mit ausdrücklicher Zustimmung pro Jagd, nur während die Jagd läuft, sichtbar für Teilnehmer, automatische Löschung nach Jagdende (DSGVO) | 3, 5 | |
| 7 | **Offline**: Drift/SQLite hinter den Repositories, Meldungen offline erfassen und später senden, Offline-Kartenausschnitt des Reviers | 3 | |
| 8 | **Konto und Betrieb**: Passwort vergessen, Konto löschen (Edge Function, App-Store-Pflicht), Profilbild-Upload, GitHub-Actions-CI (`flutter analyze`, `flutter test`, pgTAP) | – | kann jederzeit dazwischen |

PR 8 ist unabhängig und klein; er kann vorgezogen werden, sobald echte
Nutzer dazukommen (Passwort vergessen und Konto löschen sind dann Pflicht).

## PR 2 im Detail: Jagd-Oberfläche

**Wo finde ich was?**
- *Übersicht*: Abschnitt „Anstehende Jagden“ (laufende zuerst, dann die nächsten).
- *Gruppe*: Abschnitt „Jagden“ mit „+ Jagd“ für Owner und Admins.
- *Jagd*: eine Seite mit allem für den Jagdtag.

**Jagd anlegen/bearbeiten** – Titel, Beginn (Vorschlag: nächster Samstag 8 Uhr),
Ende, Revier, Treffpunkt, Freigabe, Sicherheitshinweise, Notfall, weitere Infos,
Status, Schalter „Selbst eintragen erlaubt“.

**Jagdseite**
- Kopf mit Termin, Revier, Status, Zahl der Teilnehmer und Stände.
- *Bist du dabei?* – „Ich bin dabei“ mit Rollenwahl (ohne Jagdleiter/Ansteller).
  Danach eine hervorgehobene Karte „Du bist dabei als …“ mit **deinem Stand**
  (Bezeichnung, Hinweise, Koordinaten) bzw. deiner Zone.
- *Melden* – vier große Knöpfe: Erlegt, Angeschossen, Überschossen, Anblick.
  Im Formular: Wildart per Tipp (Schwarzwild, Rehwild, …) oder frei, Anzahl,
  Stand (eigener vorausgewählt), Notiz.
- *Offene Nachsuchen* als orangefarbener Hinweis, solange eine „angeschossen“-
  Meldung nicht erledigt ist.
- *Wichtig für alle*: Treffpunkt, Freigabe, Sicherheit, Notfall.
- *Meldungen* mit Melder und Uhrzeit; Melder und Jagdleitung können erledigen
  oder löschen.
- *Stände* mit Belegung („frei“ oder Namen); Jagdleitung legt an, bearbeitet,
  löscht. Koordinaten können direkt aus Google Maps eingefügt werden
  („51.16868, 7.24749“); mit PR 3 werden Stände auf der Karte gesetzt.
- *Teilnehmer* mit Rolle, Stand und Zone; Jagdleitung trägt Gruppenmitglieder
  ein, teilt Stand/Zone zu, ändert Rollen, trägt aus. Jeder kann die eigene
  Rolle ändern und sich austragen.
- Menü der Jagdleitung: Bearbeiten, Jagd starten/beenden/absagen, Löschen
  (nur Owner/Admin).

Zonen werden in PR 3 auf der Karte gezeichnet; die Zuteilung zu Zonen ist in
der Oberfläche schon vorhanden und erscheint, sobald es Zonen gibt.

**Tests**: 3 neue Widget-Tests (Owner legt Jagd und Stand an, teilt zu,
meldet; Mitglied trägt sich ein und sieht keine Leitungsfunktionen; ohne
Selbsteintragung kein „Ich bin dabei“) und Unit-Tests für Koordinaten-Eingabe
und Sortierung. `flutter analyze` ohne Befunde, `flutter test` 87 bestanden
(13 Integrationstests ohne Backend übersprungen).

## PR 1 im Detail

### Datenmodell

```
groups ─┬─ reviere ─┬─ revier_boundaries (GeoJSON + PostGIS geom)
        │           └─ waypoints (+ geom)  ◄──────────────┐
        └─ hunts ───┬─ hunt_zones (Treiben, Sicherheits-/Sperrzone, Sammelplatz)
                    ├─ hunt_stands ── optional verknüpft mit waypoints
                    ├─ hunt_participants (Jagdrolle, Stand, Zone)
                    └─ hunt_reports (erlegt / angeschossen / überschossen / Anblick)
```

- **Jagd** (`hunts`): Titel, Termin (Beginn/Ende), Revier, Status
  (geplant, läuft, beendet, abgesagt), Treffpunkt (Text + optional Koordinaten),
  Freigabe (welches Wild), Sicherheitshinweise, Notfallinfos, Schalter
  „Selbsteintragung erlaubt“.
- **Jagdrollen** hängen an der Teilnahme, nicht an der Gruppe: Jagdleiter,
  Ansteller, Schütze, Treiber, Hundeführer, Bergung, Sonstige.
- **Stände** gehören zu einer Jagd. Sie können auf eine dauerhafte Einrichtung
  (Hochsitz, Drückjagdbock, …) zeigen oder frei gesetzt werden – so lassen sich
  Stände je Jagd neu planen, ohne die Einrichtungen des Reviers zu verändern.
- **Zonen** sind Flächen der Jagd. Treiber können einer Zone (Treiben), Schützen
  einem Stand zugeteilt werden.
- **Meldungen** sind strukturiert (Art, Wildart, Anzahl, Stand, Ort, Zeit,
  Notiz). „Erledigt“ markiert z. B. eine abgeschlossene Nachsuche; wer erledigt
  hat, setzt der Server.
- **Neue Einrichtungs-Kategorien**: Drückjagdbock, Ansitzleiter, Salzlecke,
  Suhle, Wildacker, Sammelplatz, Parkplatz.
- **PostGIS**: Reviergrenzen und Zonen erhalten eine echte Geometrie
  (`MultiPolygon`), Wegpunkte, Stände, Standorte und Meldungen eine
  Punkt-Geografie, jeweils mit räumlichem Index. GeoJSON aus einem Import
  (Feature, FeatureCollection) wird angenommen, kaputte Polygone repariert.

### Berechtigungen

| Aktion | Owner/Admin der Gruppe | Jagdleiter | Ansteller | Mitglied | Außenstehende |
| --- | :-: | :-: | :-: | :-: | :-: |
| Jagd, Zonen, Stände, Teilnehmer, Meldungen sehen | ✓ | ✓ | ✓ | ✓ | ✗ |
| Jagd anlegen | ✓ | ✗ | ✗ | ✗ | ✗ |
| Jagd bearbeiten, Status setzen | ✓ | ✓ | ✓ | ✗ | ✗ |
| Jagd löschen | ✓ | ✗ | ✗ | ✗ | ✗ |
| Zonen und Stände anlegen/ändern/löschen | ✓ | ✓ | ✓ | ✗ | ✗ |
| Sich selbst eintragen (Rolle ohne Leitung) | ✓ | ✓ | ✓ | ✓¹ | ✗ |
| Eigene Rolle/Notiz ändern, sich austragen | ✓ | ✓ | ✓ | ✓ | ✗ |
| Stand/Zone zuteilen, Teilnehmer eintragen/entfernen | ✓ | ✓ | ✓ | ✗ | ✗ |
| Jagdleiter ernennen | ✓ | ✓ | ✗ | ✗ | ✗ |
| Melden (im eigenen Namen) | ✓ | ✓ | ✓ | ✓ | ✗ |
| Fremde Meldungen ändern/erledigen/löschen | ✓ | ✓ | ✓ | nur eigene | ✗ |

¹ wenn Selbsteintragung an ist und die Jagd geplant oder laufend ist.

Wer eine Jagd anlegt, wird automatisch Jagdleiter. Wer die Gruppe verlässt
oder entfernt wird, verliert seine Teilnahmen an deren Jagden; seine Meldungen
bleiben als Protokoll erhalten.

### Tests

| Prüfung | Ergebnis |
| --- | --- |
| pgTAP `hunts.test.sql` (neu) | 57/57 |
| pgTAP gesamt (inkl. Phase 1) | 142/142 |
| Migration 0009 auf Bestand mit vorhandener Reviergrenze | Grenze wird übernommen und normalisiert |
| `flutter analyze` | keine Befunde |
| `flutter test` (Unit + Widget) | 79 bestanden, 13 Integrationstests ohne Backend übersprungen |
| Repository-Durchlauf gegen PostgREST 12 + Migrationen (lokal, ohne GoTrue) | bestanden |

Datenbanktests liefen auf PostgreSQL 16 mit PostGIS 3 und nachgebildeten
Supabase-Schemas. Der neue Integrationstest in
`test/integration/supabase_repositories_test.dart` braucht einen vollständigen
Supabase-Stack (`supabase start`) und lief deshalb hier nicht; derselbe Ablauf
wurde mit den echten Repositories gegen PostgREST geprüft.

Dabei fiel ein Fehler in `postgrest-dart` 2.9 auf: Bei `.maybeSingle()` kommt
die Fehlermeldung als roher JSON-Text an, sodass z. B. „keine Berechtigung“ als
„Serverfehler“ angezeigt wurde. `ErrorMapper` packt diese Meldungen jetzt aus –
das verbessert auch bestehende Bildschirme aus Phase 1.

### Migration einspielen (SQL Editor)

Die drei Dateien **nacheinander und jeweils einzeln** ausführen:

1. `supabase/migrations/20261104000008_waypoint_categories.sql`
2. `supabase/migrations/20261104000009_postgis_geometries.sql`
3. `supabase/migrations/20261104000010_hunts.sql`

0008 muss allein laufen, weil neue Enum-Werte erst nach dem Abschluss der
Transaktion nutzbar sind. Alle drei sind rein additiv; bestehende Daten und
die App aus Phase 1 funktionieren unverändert weiter.

## Karten-Startansicht

Mittelpunkt 51.16868205981034 N, 7.24749484403816 O, Zoom 13,5
(`AppConstants.defaultMapCenter`). Die Reviergrenze aus Chris' Google-My-Maps-
Export (≈ 676 ha) wurde gegen `geojson_to_multipolygon` geprüft und ist gültig;
sie dient als Testdatensatz für den KML-Import (PR 4) und den Offline-Ausschnitt.

## Von Chris erhalten

- Mapbox-Token (`pk.…`): liegt nur in der lokalen `.env` als
  `MAPBOX_ACCESS_TOKEN`, nicht im Repository.
- Kartenmittelpunkt und KML-Export der Reviergrenze (siehe oben).
