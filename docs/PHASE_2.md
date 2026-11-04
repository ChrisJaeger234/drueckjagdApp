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
| 2 | **Jagd-Oberfläche**: Jagden-Liste in Übersicht/Gruppe, Jagd anlegen/bearbeiten, „Ich bin dabei“ mit Rolle, Teilnehmerliste, Stände als Liste anlegen und zuteilen, „Mein Stand“, Schnellmeldungen und Meldungsliste mit offener Nachsuche | 1 | gemergt (#5) |
| 3 | **Karte**: Mapbox-Karte im Tab „Karte“, Reviergrenzen, Einrichtungen (Wegpunkte) anzeigen/anlegen per Langdruck, Zonen und Stände der Jagd, eigener GPS-Standort | 1, Mapbox-Token | zur Prüfung |
| 4 | **Import**: KML/KMZ (z. B. Export aus Google My Maps) und GPX → Reviergrenzen und Einrichtungen, Vorschau vor dem Speichern | 3 | |
| 5 | **Live während der Jagd**: Realtime für Meldungen und Teilnehmer, Push-Benachrichtigung bei neuen Meldungen (FCM/APNs über Edge Function) | 2 | |
| 6 | **Live-Standort** mit ausdrücklicher Zustimmung pro Jagd, nur während die Jagd läuft, sichtbar für Teilnehmer, automatische Löschung nach Jagdende (DSGVO) | 3, 5 | |
| 7 | **Offline**: Drift/SQLite hinter den Repositories, Meldungen offline erfassen und später senden, Offline-Kartenausschnitt des Reviers | 3 | |
| 8 | **Konto und Betrieb**: Passwort vergessen, Konto löschen (Edge Function, App-Store-Pflicht), Profilbild-Upload, GitHub-Actions-CI (`flutter analyze`, `flutter test`, pgTAP) | – | kann jederzeit dazwischen |

PR 8 ist unabhängig und klein; er kann vorgezogen werden, sobald echte
Nutzer dazukommen (Passwort vergessen und Konto löschen sind dann Pflicht).

## PR 3 im Detail: Karte

Keine Migration nötig: Grenze, Einrichtungen, Zonen und Stände nutzen die
Tabellen und Regeln aus Phase 1 und PR 1.

**Tab „Karte“ (Revierkarte)**
- Startet auf der Reviergrenze (ohne Grenze: Mittelpunkt 51.16868, 7.24749).
  Bei mehreren Revieren oben auswählen.
- Hintergrund *Gelände* (Mapbox Outdoors) oder *Luftbild* (Mapbox Satellite
  mit Straßen), umschaltbar oben rechts.
- **Mein Standort** unten rechts: blauer Punkt mit Genauigkeitskreis, folgt
  der Bewegung. Die Position wird nicht gespeichert.
- **Einrichtungen**: Symbol je Kategorie (Hochsitz, Kanzel, Drückjagdbock …).
  Tippen zeigt Details und Koordinaten zum Kopieren, Owner/Admins und der
  Ersteller können bearbeiten und löschen.
- **Lange drücken** legt an dieser Stelle eine Einrichtung an (Owner/Admins).
- **Kartenmenü** oben links: ganzes Revier zeigen, Reviergrenze zeichnen bzw.
  neu zeichnen, Reviergrenze löschen. Gezeichnet wird durch Antippen der
  Eckpunkte (mit Rückgängig); die Fläche in Hektar steht unten.
- Revierseite: Abschnitt „Karte & Einrichtungen“ mit Fläche, Anzahl je
  Kategorie und „Auf der Karte öffnen“.

**Jagdkarte** (Jagd → Kartensymbol oben bzw. „Auf der Karte zeigen“ bei
„Dein Stand“)
- Reviergrenze, Zonen (Treiben grün, Sicherheits-/Sperrzone rot, Sammelplatz
  blau), Stände mit Bezeichnung, Treffpunkt, Einrichtungen blass im
  Hintergrund.
- **Dein Stand** ist orange mit Stern; im Menü „Zu meinem Stand“.
- Stand antippen: wer dort steht, Hinweise, Koordinaten; Jagdleitung kann
  bearbeiten und löschen.
- Jagdleitung: **lange drücken** setzt einen Stand (Formular mit
  vorausgefüllten Koordinaten); Einrichtung antippen → „Als Stand für diese
  Jagd übernehmen“ (Name und Lage werden übernommen, Verknüpfung bleibt);
  **Zone zeichnen** im Menü, danach Art und Name wählen. Zone antippen zeigt
  Art und Fläche, Jagdleitung kann sie löschen.

**Technik**: `flutter_map` 8 mit Mapbox-Rasterkacheln statt nativem Mapbox-SDK,
damit die App auch im Browser läuft. GPS über `geolocator` (iOS/Android/Web),
Berechtigungstexte für iOS und Android sind eingetragen. Ohne Mapbox-Token
zeigt die Karte OpenStreetMap.

**Tests**: 13 neue Unit-Tests (GeoJSON lesen/schreiben, Fläche, Punkt in
Fläche, Modelle, Kartenquelle, geheimer Token wird abgelehnt, Stand-Link),
5 neue Widget-Tests (Revierkarte mit Langdruck-Anlage; Grenze zeichnen mit
Rückgängig; Mitglied ohne Bearbeitung; eigener Standort; Jagdkarte: Einrichtung
als Stand übernehmen, Stand per Langdruck, Treiben zeichnen) und ein
Integrationstest für das Karten-Repository. `flutter analyze` ohne Befunde,
`flutter test` 105 bestanden (14 Integrationstests ohne Backend übersprungen).
Das Karten-Repository lief zusätzlich gegen PostgREST 12 mit allen
Migrationen: Chris' KML-Grenze wird als FeatureCollection angenommen und als
MultiPolygon mit 675 ha gespeichert, erneutes Speichern ersetzt statt zu
verdoppeln, Mitglieder dürfen lesen, aber weder Grenze noch Einrichtungen
ändern. Im Browser (Chromium) geprüft: Mapbox-Gelände und -Luftbild laden,
Revier- und Jagdkarte ohne Konsolenfehler.

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
