# Einrichtung und Start

## Voraussetzungen

| Werkzeug | Version (getestet) | Zweck |
| --- | --- | --- |
| Flutter | 3.47.9 stable (Dart 3.13.7) | App |
| Xcode | aktuell | iOS-Builds (nur macOS) |
| Android Studio / Android SDK | aktuell | Android-Builds |
| Supabase CLI | 3.x | Migrationen, lokaler Stack, Tests |
| Docker | aktuell | nur für den lokalen Supabase-Stack |

## 1. Supabase-Projekt anlegen (einmalig)

1. Auf <https://supabase.com/dashboard> ein neues Projekt anlegen
   (Region z. B. Frankfurt `eu-central-1`). Datenbank-Passwort sicher notieren.
2. Migrationen einspielen:
   ```bash
   supabase login
   supabase link --project-ref <PROJECT_REF>   # steht in der Projekt-URL
   supabase db push
   ```
3. **Authentication → Providers → Email**
   - „Confirm email“ **aktivieren**.
   - Minimum password length: **8**, Password requirements: **Letters and digits**.
4. **Authentication → URL Configuration → Redirect URLs**
   - `de.drueckjagd.app://login-callback` hinzufügen (Link aus der Bestätigungs-E-Mail öffnet die App).
5. **Project Settings → API Keys**: den **Publishable key** (`sb_publishable_…`)
   kopieren. Den Secret key **nicht** verwenden.
6. Für echte Benutzer: unter **Authentication → Emails → SMTP Settings** einen
   eigenen SMTP-Server eintragen.

## 2. App konfigurieren

```bash
cp .env.example .env
# .env öffnen und SUPABASE_URL sowie SUPABASE_PUBLISHABLE_KEY eintragen
```

`.env` ist in `.gitignore` eingetragen und wird nicht eingecheckt.
Ohne gültige Werte startet die App mit dem Hinweis „Einrichtung erforderlich“ –
es wird keine Verbindung vorgetäuscht.

## 3. App starten

```bash
flutter pub get
flutter run --dart-define-from-file=.env
```

Release-Builds:

```bash
flutter build apk --dart-define-from-file=.env        # Android
flutter build ipa --dart-define-from-file=.env        # iOS (macOS)
```

Vor einer Veröffentlichung im Store: eigene Application-ID/Bundle-ID festlegen
(aktuell `de.drueckjagd.drueckjagd_app`) und das Android-Signing konfigurieren
(`android/app/build.gradle.kts`, derzeit Debug-Schlüssel).

## 4. Lokale Entwicklung mit Supabase (optional, empfohlen)

```bash
supabase start            # startet Postgres, Auth, REST, Storage in Docker
supabase status           # zeigt URL und Publishable key
supabase db reset         # spielt alle Migrationen neu ein
```

Für die App im Android-Emulator ist die lokale API unter
`http://10.0.2.2:54321` erreichbar, im iOS-Simulator unter
`http://127.0.0.1:54321`. Lokal ist die E-Mail-Bestätigung deaktiviert
(`supabase/config.toml`), sodass Registrierungen sofort angemeldet sind.

## 5. Tests

```bash
flutter analyze                 # statische Analyse
flutter test                    # Unit- und Widget-Tests (ohne Backend)
supabase test db                # pgTAP: RLS und SQL-Funktionen (lokaler Stack)

# Integrationstests der Repositories gegen den lokalen Stack:
flutter test test/integration \
  --dart-define=SUPABASE_TEST_URL=http://127.0.0.1:54321 \
  --dart-define=SUPABASE_TEST_KEY=<Publishable key aus `supabase status`>
```

Ohne `SUPABASE_TEST_URL`/`SUPABASE_TEST_KEY` werden die Integrationstests bei
`flutter test` mit einem klaren Hinweis übersprungen (sie benötigen ein Backend).

Die Integrationstests legen Testbenutzer an. Nur gegen den **lokalen** Stack
oder ein separates Testprojekt ausführen, nie gegen das Produktivprojekt.
