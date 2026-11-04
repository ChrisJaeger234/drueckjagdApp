# Sicherheit und Berechtigungen

## Grundsätze

1. **Serverseitige Durchsetzung.** Alle Regeln stehen in RLS-Policies und
   `SECURITY DEFINER`-Funktionen. Die App blendet Aktionen nur aus.
2. **Standardmäßig verboten.** RLS ist auf jeder Tabelle aktiv. Die Rolle
   `anon` hat keinerlei Tabellenrechte. `authenticated` erhält nur die
   benötigten Rechte – bei `UPDATE` sogar spaltengenau, damit z. B. ein Revier
   nicht per `group_id` in eine fremde Gruppe verschoben werden kann.
3. **Keine Secrets in der App.** Nur der Publishable-/Anon-Key wird verwendet.
   Die App verweigert den Start mit einem Secret-/Service-Role-Key.
   `.env` ist in `.gitignore` eingetragen.
4. **Hilfsfunktionen im Schema `private`.** Dieses Schema wird von der API nicht
   veröffentlicht. Alle Funktionen setzen `search_path = ''`.

## Rollenmodell

| Aktion | Owner | Admin | Member | Nicht-Mitglied |
| --- | :-: | :-: | :-: | :-: |
| Gruppe, Mitglieder, Reviere, Wegpunkte, Nachrichten sehen | ✓ | ✓ | ✓ | ✗ |
| Gruppe bearbeiten / löschen | ✓ | ✗ | ✗ | ✗ |
| Admins die Mitgliederverwaltung erlauben/entziehen | ✓ | ✗ | ✗ | ✗ |
| Einladungen erstellen, sehen, widerrufen | ✓ | ✓¹ | ✗ | ✗ |
| Mitglieder (Rolle `member`) entfernen | ✓ | ✓¹ | ✗ | ✗ |
| Admins/Owner entfernen | ✓ | ✗ | ✗ | ✗ |
| Rollen vergeben (Admin/Owner ernennen) | ✓ | ✗ | ✗ | ✗ |
| Reviere anlegen / bearbeiten | ✓ | ✓ | ✗ | ✗ |
| Reviere löschen | ✓ | ✗ | ✗ | ✗ |
| Wegpunkte anlegen | ✓ | ✓ | ✗ | ✗ |
| Wegpunkte bearbeiten/löschen | ✓ | ✓ | nur eigene | ✗ |
| Eigenen Standort speichern/lesen | ✓ | ✓ | ✓ | ✗ |
| Standorte anderer lesen | ✗² | ✗² | ✗² | ✗ |
| Nachrichten schreiben / eigene löschen | ✓ | ✓ | ✓ | ✗ |
| Gruppe verlassen | ✓³ | ✓ | ✓ | – |

¹ nur wenn `groups.admins_can_manage_members = true` (Standard, vom Owner abschaltbar)
² Standortfreigabe in der Gruppe folgt in Phase 2 mit expliziter Zustimmung
³ nicht als letzter Owner

Profile sind nur für den Benutzer selbst und für Benutzer mit mindestens einer
gemeinsamen Gruppe lesbar; bearbeiten darf man nur das eigene Profil.

## Einladungscodes

- Erzeugung serverseitig mit `gen_random_bytes(12)`, 12 Zeichen
  Crockford-Base32 (ohne I, L, O, U) → **60 Bit Zufall**, Format `XXXX-XXXX-XXXX`.
  Bei 256 Bytewerten und 32 Zeichen entsteht keine Verzerrung durch den Modulo.
- Gespeichert wird nur `SHA-256(normalisierter Code)`; die Spalte `code_hash`
  ist für Clients nicht lesbar. Der Klartext wird genau einmal an den Ersteller
  zurückgegeben.
- Gebunden an genau eine Gruppe, optional mit Ablaufdatum (Standard 7 Tage,
  maximal 90) und Nutzungslimit (Standard in der App: einmalig).
- Einlösen prüft Existenz, Widerruf, Ablauf und Limit in einer Transaktion
  (`SELECT … FOR UPDATE`). Alle Fehlerfälle liefern dieselbe Antwort, damit
  nicht unterscheidbar ist, ob ein Code existiert.
- **Drosselung:** maximal 10 fehlgeschlagene Versuche je Benutzer in 15 Minuten.
  Zusammen mit 60 Bit Entropie ist Raten praktisch ausgeschlossen.
- Erstellen, Ansehen und Widerrufen nur für Owner bzw. berechtigte Admins.

## Tests der Berechtigungen

`supabase/tests/database/rls.test.sql` enthält 57 pgTAP-Tests, die mit echten
Rollen (`authenticated`/`anon`) und JWT-Claims laufen, u. a.:

- Nicht-Mitglieder sehen keine Gruppen, Mitglieder, Profile, Reviere,
  Wegpunkte oder Nachrichten fremder Gruppen.
- Direktes Eintragen in `group_members` oder Anlegen von `groups` ist verboten.
- Member können sich nicht selbst befördern, keine Einladungen erzeugen und
  keine Reviere anlegen oder umbenennen.
- Admins können die Gruppe nicht bearbeiten, den Owner nicht entfernen und
  verlieren ihre Verwaltungsrechte, wenn der Owner sie entzieht.
- Abgelaufene, widerrufene und aufgebrauchte Codes werden abgelehnt;
  Code-Hashes und Fehlversuche sind nicht lesbar; die Drosselung greift.
- Standorte anderer sind auch für Owner nicht lesbar.
- `anon` hat keinen Zugriff.

Zusätzlich prüfen die Integrationstests (`test/integration/`) dieselben Regeln
über die echten Repositories der App gegen einen laufenden Supabase-Stack.

## Empfehlungen für den Produktivbetrieb

- In Supabase **E-Mail-Bestätigung aktivieren** (Authentication → Providers → Email).
- Passwortregeln wie lokal einstellen: mindestens 8 Zeichen, Buchstaben und Ziffern.
- Leaked-Password-Protection und CAPTCHA (bei öffentlicher Registrierung) aktivieren.
- Eigenen SMTP-Server für Auth-E-Mails einrichten (der eingebaute ist stark limitiert).
- Den Service-Role-Key nur in Edge Functions oder auf Servern verwenden.
- Regelmäßig den Security Advisor im Supabase-Dashboard prüfen.
