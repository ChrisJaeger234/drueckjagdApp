# Checkliste: Supabase-Projekt einrichten und App verbinden

Zum Abhaken, in dieser Reihenfolge. Details zu Werkzeugen und lokalen Tests
stehen in [SETUP.md](SETUP.md).

## A. Projekt anlegen

- [ ] Auf <https://supabase.com/dashboard> **New project** anlegen.
- [ ] Region **Central EU (Frankfurt)** wählen (DSGVO, kurze Wege).
- [ ] Datenbank-Passwort im Passwortmanager speichern (wird für `supabase link` gebraucht).
- [ ] Project Ref notieren: steht in der URL `https://supabase.com/dashboard/project/<PROJECT_REF>`.

## B. Datenbank einspielen (Migrationen 0001–0006)

- [ ] Supabase CLI 3.x installiert: `supabase --version`
- [ ] Im Projektordner:
      ```bash
      supabase login
      supabase link --project-ref <PROJECT_REF>
      supabase db push --dry-run   # zeigt die 6 Migrationen, die eingespielt werden
      supabase db push
      ```
- [ ] Kontrolle im Dashboard → **Database → Migrations**: sechs Einträge
      `20261104000001` … `20261104000006`.
- [ ] Kontrolle → **Table Editor**: Tabellen `profiles`, `groups`, `group_members`,
      `group_invites`, `group_invite_attempts`, `reviere`, `revier_boundaries`,
      `waypoints`, `locations`, `messages` vorhanden, bei allen „RLS enabled“.
- [ ] Kontrolle → **Storage**: privater Bucket `avatars` vorhanden.
- [ ] Kontrolle → **Database → Extensions**: `postgis` und `pgcrypto` aktiv.
- [ ] **Advisors → Security Advisor** öffnen: es sollten keine Fehler zu RLS
      oder exponierten Funktionen erscheinen. Falls doch, Meldung notieren und
      vor Phase 2 klären.

> Bestehende Migrationen nie nachträglich ändern. Neue Änderungen immer mit
> `supabase migration new <name>` als neue Datei anlegen.

## C. Authentifizierung

**Authentication → Sign In / Providers → Email**

- [ ] „Enable Email provider“: an
- [ ] **„Confirm email“: an** (lokal ist sie aus, in der Cloud muss sie an sein)
- [ ] „Secure email change“: an
- [ ] Minimum password length: **8**
- [ ] Password requirements: **Letters and digits**
- [ ] „Allow anonymous sign-ins“: aus

**Authentication → URL Configuration**

- [ ] **Site URL**: `de.drueckjagd.app://login-callback`
- [ ] **Redirect URLs**: `de.drueckjagd.app://login-callback` hinzufügen
      (exakt so; falls du in `.env` eine andere `AUTH_REDIRECT_URL` setzt, diese hier eintragen)

**Authentication → Emails → SMTP Settings**

- [ ] Eigenen SMTP-Server eintragen (z. B. Brevo, Postmark, Mailjet, eigener Mailserver).
      Ohne eigenen SMTP verschickt Supabase Bestätigungs-Mails nur an Mitglieder
      deines Supabase-Teams und nur wenige pro Stunde. Für Tests mit deiner eigenen
      Adresse reicht es vorerst.
- [ ] Optional: Vorlage „Confirm signup“ auf Deutsch übersetzen. Den Platzhalter
      `{{ .ConfirmationURL }}` unverändert lassen.

**Authentication → Rate Limits**

- [ ] Standardwerte belassen; nach Einrichtung von SMTP „emails per hour“ an die
      erwartete Teilnehmerzahl vor einer Jagd anpassen (z. B. 100).

## D. API-Schlüssel holen

**Project Settings → API Keys**

- [ ] **Project URL** kopieren: `https://<PROJECT_REF>.supabase.co`
- [ ] **Publishable key** kopieren (`sb_publishable_…`).
- [ ] Den **Secret key** (`sb_secret_…`) bzw. `service_role` **nicht** kopieren und
      nirgends in die App eintragen. Die App verweigert den Start, wenn sie so einen
      Schlüssel erkennt.

## E. `.env` anlegen

- [ ] Im Projektordner:
      ```bash
      cp .env.example .env
      ```
- [ ] `.env` ausfüllen (ohne Anführungszeichen, ohne Leerzeichen um `=`):
      ```
      SUPABASE_URL=https://<PROJECT_REF>.supabase.co
      SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
      ```
- [ ] `AUTH_REDIRECT_URL` nur setzen, wenn du vom Standard
      `de.drueckjagd.app://login-callback` abweichst.
- [ ] Prüfen, dass `.env` nicht eingecheckt wird: `git status` darf `.env` nicht zeigen.

## F. App starten und Verbindung prüfen

- [ ] `flutter pub get`
- [ ] `flutter run --dart-define-from-file=.env`
      (Android Studio / VS Code: dieselbe Option in der Run-Konfiguration unter
      „Additional run args“ eintragen.)
- [ ] Startbildschirm zeigt **nicht** „Einrichtung erforderlich“. Falls doch:
      die angezeigte Meldung nennt den fehlenden oder falschen Wert.

## G. Funktionstest auf einem echten Gerät

- [ ] Registrieren mit echter E-Mail-Adresse → Hinweis „E-Mail gesendet“.
- [ ] Anmelden vor der Bestätigung → Meldung „Bitte bestätige zuerst deine E-Mail-Adresse“
      mit Button „erneut senden“.
- [ ] Bestätigungslink **auf dem Handy** öffnen → App öffnet sich und ist angemeldet.
      (Am PC geöffnet wird die Adresse ebenfalls bestätigt; danach in der App normal anmelden.)
- [ ] Dashboard → **Authentication → Users**: Benutzer hat „Email confirmed“.
- [ ] Dashboard → **Table Editor → profiles**: Profilzeile wurde automatisch angelegt.
- [ ] Profil: Benutzername und Anzeigename speichern.
- [ ] Gruppe anlegen → du bist Owner. Revier anlegen.
- [ ] Einladung erzeugen, mit einem **zweiten Konto** (zweites Gerät oder zweite
      E-Mail) einlösen → zweites Konto ist `member`, sieht Gruppe und Revier,
      kann aber kein Revier anlegen und keine Einladungen sehen.
- [ ] Mit einem **dritten Konto ohne Einladung** prüfen: sieht keine Gruppe, kein
      Revier, keine Profile der anderen.

## H. Vor dem ersten Store-Build (später)

- [ ] Eigene Application-ID / Bundle-ID festlegen und dann das Deeplink-Schema in
      `AndroidManifest.xml`, `Info.plist`, `.env` und den Redirect URLs gemeinsam anpassen.
- [ ] Android-Signing konfigurieren (derzeit Debug-Schlüssel).
- [ ] Getrenntes Supabase-Projekt für Tests/Entwicklung anlegen, damit
      Integrationstests nie gegen Echtdaten laufen.
