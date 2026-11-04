# Drückjagd Web-App (React + TypeScript + Vite, PWA)

Neue Oberfläche der Drückjagd-App nach der Technologieentscheidung (Architekturbericht,
Phase 1). Sie nutzt dasselbe Supabase-Projekt wie die Flutter-App: gleiche Konten, Daten,
RLS-Regeln und Migrationen unter `../supabase/`. Die Flutter-App bleibt bis zum Umschalten
unverändert die Rückfallebene.

## Stand Phase 7

- Offline-Karten je Revier (`src/modules/map/tileStore.ts`): auf der Revierseite Kartentypen (Karte,
  Luftbild) und Detailstufe wählen; die App schätzt Kachelzahl und Größe und lädt das Gebiet der
  Grenze und Einrichtungen plus 500 m Rand ab Zoom 10. Jedes Paket liegt in einem eigenen
  Cache-Storage-Cache `map-pack:<revierId>`, die Angaben dazu in IndexedDB.
- Die Karte liest jede Kachel zuerst aus den Paketen, dann aus dem Netz (eigene MapLibre-Protokolle
  `basemap://` und `nrwdop://`). Abbruch speichert den Stand als „unvollständig“; beim Aktualisieren
  bleiben alte Kacheln erhalten, wenn der Abruf scheitert. Obergrenze 12.000 Kacheln je Paket.
- Das Profil listet alle Pakete mit Größe und belegtem Speicher; die Jagdseite zeigt, ob die Karte des
  Reviers offline vorliegt. Beim Abmelden werden alle Pakete gelöscht.
- e2e: `e2e/offline-maps-local.mjs` ersetzt die Kachelserver durch eine kleine PNG-Antwort.

## Stand Phase 6

- Alle geladenen Daten (Gruppen, Reviere, Jagden, Stände, Zonen, Teilnehmer, Meldungen) werden pro
  Benutzer in IndexedDB gespeichert (`src/lib/offline.ts`) und beim Start sofort gezeigt, auch ohne
  Netz; mit Netz wird gleich frisch geladen. Beim Abmelden wird der Speicher gelöscht. Die App bittet
  den Browser um dauerhaften Speicher (`navigator.storage.persist`), damit iOS ihn nicht räumt.
- Meldungen im Funkloch: Die Meldung erscheint sofort mit „Wartet auf Netz“, liegt in einer
  Warteschlange, übersteht Neustarts und wird automatisch gesendet. Sie trägt eine Geräte-ID und den
  Zeitpunkt des Antippens, so entsteht bei Wiederholungen keine Dublette.
- Der Hinweis oben zeigt, wie viele Meldungen noch warten.

## Stand Phase 5

- Jagden je Gruppe planen (Owner und Admins): Termin, Revier, Treffpunkt, Freigabe,
  Sicherheits- und Notfallhinweise, Selbsteintragung; der Ersteller wird per Trigger Jagdleiter
- Übersicht zeigt die nächsten Jagden aus allen Gruppen
- Teilnahme: selbst eintragen als Schütze, Treiber, Hundeführer, Bergung oder Sonstige;
  die Jagdleitung (Owner, Admins, Jagdleiter, Ansteller) trägt Mitglieder ein, vergibt Rollen und
  teilt Stände und Zonen zu
- Stände per Tipp auf die Karte oder am eigenen Standort setzen, der eigene Stand ist hervorgehoben
- Zonen zeichnen: Treiben, Sicherheits- und Sperrzonen, Sammelplätze (farbig auf der Karte)
- Meldungen mit wenigen Tipps: erlegt, angeschossen, überschossen, Anblick, mit Wildart, Anzahl,
  Stand und optional Standort; offene Nachsuchen stehen oben und lassen sich als erledigt markieren
- Jagd starten, beenden, absagen, wieder öffnen und löschen (Owner und Admins)

## Stand Phase 4

- Karte mit MapLibre GL JS und offenen Daten ohne Schlüssel: basemap.de (Karte) und Geobasis NRW
  (Luftbild); die Karte wird erst geladen, wenn eine Seite sie braucht, und vom Service Worker
  vorgehalten (Offline-Kachelpakete folgen in Phase 7)
- Reviere je Gruppe anlegen, bearbeiten (Owner und Admins) und löschen (Owner)
- Reviergrenze durch Antippen der Eckpunkte zeichnen oder aus KML, GPX oder GeoJSON importieren;
  die Datenbank prüft und normalisiert sie (Migration 0009), die App zeigt die Fläche in Hektar
- Einrichtungen (Hochsitz, Drückjagdbock, Kirrung, Sammelplatz, …) per Tipp auf die Karte oder am
  eigenen Standort setzen, bearbeiten und löschen
- Übersichtskarte aller Reviere aus allen Gruppen; „Mein Standort“ zeigt die eigene Position nur
  lokal an, solange die Seite offen ist (keine Speicherung, keine Freigabe)

## Stand Phase 3

- Gruppen: eigene Gruppen mit Rolle, Gruppe erstellen (RPC `create_group`), bearbeiten und löschen
  (nur Owner), Einstellung „Admins dürfen Mitglieder verwalten“
- Mitglieder mit Profilbild; Owner ändert Rollen, Owner und berechtigte Admins entfernen Mitglieder;
  Austritt (der einzige Owner kann nicht austreten)
- Einladungen mit Gültigkeit (24 h, 7 Tage, 30 Tage) und Nutzungen (1, 5, 20, unbegrenzt); der Code
  wird nur einmal angezeigt und kann als Link `…/gruppe/beitreten?code=…` geteilt werden; Liste mit
  Status und Widerruf
- Rechte werden nur in der Datenbank durchgesetzt (RLS und SQL-Funktionen); die App blendet nur aus

## Stand Phase 2

- Anmelden, Registrieren mit E-Mail-Bestätigung (erneut senden), Passwort vergessen und neu setzen
- Profil anzeigen und bearbeiten (Anzeige- und Benutzername), Profilbild-Upload in den privaten
  Bucket `avatars` (vorher auf 512 px verkleinert), Abmelden auch ohne Netz
- Weiterleitung je nach Anmeldestatus wie `auth_redirect.dart`; Fehlertexte und Eingabeprüfungen
  1:1 aus `error_mapper.dart` und `validators.dart`
- Ohne Supabase-Konfiguration zeigt die App einen Einrichtungshinweis

**iPhone-Hinweis:** Links aus Bestätigungs- und Passwort-Mails öffnen sich in Safari, nicht in der
App vom Home-Bildschirm (getrennter Speicher). Nach dem Bestätigen meldet man sich in der App
einfach mit E-Mail und Passwort an.

## Stand Phase 1

- App-Hülle mit den fünf Bereichen der Flutter-App (Übersicht, Karte, Gruppe, Chat, Profil):
  Navigationsleiste unten auf dem Smartphone, links ab Tablet-Breite
- Farben aus `lib/app/theme/app_colors.dart`, Hell- und Dunkelmodus
- PWA: installierbar, startet offline (auch direkt auf Unterseiten), Hinweis bei fehlendem Netz,
  Installationsanleitung für iPhone und Android
- Supabase-Konfiguration mit derselben Prüfung wie die Flutter-App (lehnt Service-Role-Keys ab,
  baut ohne gültige Werte keine Scheinverbindung auf)

## Aufbau

```
src/
  app/          App-Hülle, Router (TanStack Router), Provider (TanStack Query)
  components/   gemeinsame UI-Bausteine
  features/     ein Ordner je Fachbereich (overview, map, groups, chat, profile, …)
  lib/          Konfiguration, Supabase-Client, kleine Hooks
  sw.ts         Service Worker (Workbox-Precache, Navigation offline)
```

Ab den späteren Phasen kommen `src/modules/{map,location,sync,push}` für Karte,
Standortdienst, Offline-Synchronisierung und Push dazu, unabhängig voneinander gekapselt.

## Entwicklung

```bash
cp .env.example .env.local   # Werte aus dem Supabase-Dashboard (nur öffentliche Schlüssel)
npm ci
npm run dev                  # http://localhost:5173
npm run lint && npm run typecheck && npm test
npm run build && npx vite preview --port 4180 &
NODE_PATH=$(npm root -g) npm run e2e   # Rauchtest mit Playwright
```

Ende-zu-Ende gegen eine lokale Datenbank mit allen Migrationen (siehe Kopf von
`e2e/auth-local.mjs`): `supabase start` im Repository, App mit dessen URL und Key bauen, dann
`node e2e/auth-local.mjs`, `node e2e/groups-local.mjs` (zwei Konten: Gruppe, Einladung,
Beitritt, Rollen, Austritt, Löschen) `node e2e/reviere-local.mjs` (echte Karte: Grenze zeichnen
und importieren, Einrichtungen, Mitgliedersicht, Standort) und `node e2e/hunts-local.mjs` (Jagd planen,
selbst eintragen, Stand setzen und zuteilen, Treiben, Meldung und Nachsuche) sowie `node e2e/offline-local.mjs`
(Neustart ohne Netz, Meldung in der Warteschlange, Senden nach Netzrückkehr). Alle laufen auch in der CI.

## Veröffentlichung

`.github/workflows/pages.yml` veröffentlicht bei Änderungen in `main` unter
`https://chrisjaeger234.github.io/drueckjagdApp/app/`. Die Supabase-Werte kommen aus den
Repository-Variablen `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY`
(bzw. `VITE_SUPABASE_ANON_KEY`). Die eigene Domain folgt in Phase 11.
