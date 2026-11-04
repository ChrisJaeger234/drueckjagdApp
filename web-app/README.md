# Drückjagd Web-App (React + TypeScript + Vite, PWA)

Neue Oberfläche der Drückjagd-App nach der Technologieentscheidung (Architekturbericht,
Phase 1). Sie nutzt dasselbe Supabase-Projekt wie die Flutter-App: gleiche Konten, Daten,
RLS-Regeln und Migrationen unter `../supabase/`. Die Flutter-App bleibt bis zum Umschalten
unverändert die Rückfallebene.

## Stand Phase 1

- App-Hülle mit den fünf Bereichen der Flutter-App (Übersicht, Karte, Gruppe, Chat, Profil):
  Navigationsleiste unten auf dem Smartphone, links ab Tablet-Breite
- Farben aus `lib/app/theme/app_colors.dart`, Hell- und Dunkelmodus
- PWA: installierbar, startet offline (auch direkt auf Unterseiten), Hinweis bei fehlendem Netz,
  Installationsanleitung für iPhone und Android
- Supabase-Konfiguration mit derselben Prüfung wie die Flutter-App (lehnt Service-Role-Keys ab,
  baut ohne gültige Werte keine Scheinverbindung auf)
- Die Bereiche selbst folgen ab Phase 2 (Anmeldung und Profil)

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

## Veröffentlichung

`.github/workflows/pages.yml` veröffentlicht bei Änderungen in `main` unter
`https://chrisjaeger234.github.io/drueckjagdApp/app/`. Die Supabase-Werte kommen aus den
Repository-Variablen `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY`
(bzw. `VITE_SUPABASE_ANON_KEY`). Die eigene Domain folgt in Phase 11.
