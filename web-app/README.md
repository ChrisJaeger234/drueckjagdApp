# Drückjagd Web-App (React + TypeScript + Vite, PWA)

Neue Oberfläche der Drückjagd-App nach der Technologieentscheidung (Architekturbericht,
Phase 1). Sie nutzt dasselbe Supabase-Projekt wie die Flutter-App: gleiche Konten, Daten,
RLS-Regeln und Migrationen unter `../supabase/`. Die Flutter-App bleibt bis zum Umschalten
unverändert die Rückfallebene.

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
`node e2e/auth-local.mjs` sowie `node e2e/groups-local.mjs` (zwei Konten: Gruppe, Einladung,
Beitritt, Rollen, Austritt, Löschen). Beide laufen auch in der CI.

## Veröffentlichung

`.github/workflows/pages.yml` veröffentlicht bei Änderungen in `main` unter
`https://chrisjaeger234.github.io/drueckjagdApp/app/`. Die Supabase-Werte kommen aus den
Repository-Variablen `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY`
(bzw. `VITE_SUPABASE_ANON_KEY`). Die eigene Domain folgt in Phase 11.
