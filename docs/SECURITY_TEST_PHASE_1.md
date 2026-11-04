# Sicherheitstest Phase 1 (RLS, Rollen, Einladungen)

**Datum:** 04.11.2026 · **Ziel:** echtes Supabase-Projekt `dvbqvtubqnijwnyyrurt`
(Migrationen 0001–0006 eingespielt) · **Methode:** ausschließlich serverseitig
über die öffentliche REST-/RPC-API mit dem Anon-Key und echten Logins. Kein
Service-Role-Key, keine Prüfung über die App-Oberfläche.

## Testkonten

| Konto | Rolle im Test |
| --- | --- |
| A | Owner der Testgruppe „RLS-Test Gruppe“ |
| B | Außenstehender (nie eingeladen) |
| C | erst Mitglied, dann Admin, dann wieder Mitglied, dann entfernt |

## Ergebnis

**127 Prüfungen, 126 bestanden, 1 Befund (behoben in Migration 0007).**

| Bereich | Prüfungen | Ergebnis |
| --- | --: | --- |
| Ohne Login (anon): Tabellen, RPCs, Schema `private` | 6 | alles blockiert |
| Außenstehender B: Lesen aller Tabellen, Ändern, Löschen, Anlegen, RPCs, Fälschen von Absender/Profil | 35 | alles blockiert |
| Mitglied C: Lesen erlaubt; Reviere/Wegpunkte/Grenzen anlegen, ändern, löschen; Gruppe ändern; Einladen; Rollen | 32 | wie vorgesehen |
| Admin C: Reviere/Wegpunkte/Grenzen verwalten, einladen; Gruppe ändern/löschen, Owner entfernen, Rollen | 17 | wie vorgesehen |
| Owner A: letzter Owner geschützt, Grenzwerte für Einladungen | 4 | wie vorgesehen |
| Einladungen: Einlösen, Normalisierung, Doppel-Einlösen, Widerruf, Einmal-Code, Drosselung | 11 | 1 Befund |
| Herabgestufter Admin: kein Revier mehr anlegen; eigener Wegpunkt (Beobachtung) | 2 | wie vorgesehen |
| Entferntes Mitglied sieht nichts mehr | 6 | blockiert |
| Owner-Aktionen: Testdaten anlegen, Rollen vergeben, Freigabe entziehen, entfernen | 14 | ok |

Einzelheiten:

- B sieht weder Gruppe, Mitglieder, Revier, Reviergrenze, Wegpunkt, Nachricht,
  Standort, Einladungen noch das Profil von A. Alle `PATCH`/`DELETE` betreffen
  0 Zeilen (danach von A gegengeprüft: Daten unverändert), alle `INSERT`
  scheitern an RLS, direkte Rollenänderung scheitert an fehlenden Rechten, alle
  Verwaltungs-RPCs liefern `not_authorized`.
- Absender- und Standort-Fälschung (`sender_id`/`user_id` = A) wird abgelehnt.
- Ein Revier kann nicht per `group_id` in eine andere Gruppe verschoben werden.
- Nachrichten sind nicht änderbar; fremde Nachrichten nicht löschbar – auch
  nicht für Admins.
- Der Code-Hash von Einladungen ist nicht lesbar. Mitglieder und Admins ohne
  Freigabe sehen keine Einladungen.
- Nach 10 Fehlversuchen ist ein Konto 15 Minuten gesperrt, auch für gültige Codes.
- Das Schema `private` und `handle_new_user` sind nicht per API erreichbar.

## Befunde

### 1 · Mittel · Entferntes Mitglied kann mit altem Code wieder beitreten — behoben

Owner entfernt C. Der ursprüngliche Einladungscode (mehrfach nutzbar, noch
gültig) bleibt aber gültig, und C war sofort wieder Mitglied. Ein
Rauswurf war damit wirkungslos, solange der Code lebt (Standard: 7 Tage).

**Fix (0007):** Entfernungen werden in `group_member_removals` protokolliert
(kein Clientzugriff). `redeem_group_invite` lehnt Codes ab, die **vor** der
Entfernung erstellt wurden – mit derselben neutralen Antwort wie bei
ungültigen Codes. Eine neue Einladung nach der Entfernung funktioniert
(bewusste Wiederaufnahme); freiwilliges Verlassen sperrt nicht.

### 2 · Niedrig · Mitgliedschaft war für Außenstehende abfragbar — behoben

`remove_group_member` antwortete Außenstehenden je nach Ziel mit
`member_not_found` oder `not_authorized`. Wer Gruppen- und Benutzer-UUID kennt,
konnte so prüfen, ob jemand Mitglied ist. **Fix (0007):** Die Berechtigung wird
zuerst geprüft; Unberechtigte bekommen immer `not_authorized`.

### Beobachtungen (kein Handlungsbedarf für Phase 2)

- Ein herabgestufter Admin kann von ihm angelegte Wegpunkte weiter bearbeiten
  und löschen. Das entspricht der dokumentierten Regel „Member: nur eigene“.
- `member_not_found` (P0002) und `too_many_attempts` (54000) kommen über die API
  als HTTP 500 an. Die App wertet die Fehlermeldung aus; funktional kein Problem.
- GraphQL (`pg_graphql`) ist im Projekt nicht aktiviert – keine zusätzliche
  Angriffsfläche.
- Supabase-Mailversand ohne eigenes SMTP: nur wenige Mails pro Stunde. Vor
  echten Nutzern eigenes SMTP einrichten (Authentication → SMTP Settings).

## Verifikation der Fixes

- Neue pgTAP-Tests `supabase/tests/database/rls_security_test_fixes.test.sql`
  (12 Tests). Lokal gegen PostgreSQL 16 mit 0001–0004, 0006, 0007: 12/12
  bestanden; bestehende `rls.test.sql` 57/57, `review_hardening.test.sql` 15/16
  (der eine Test braucht Supabase-Storage, lokal nicht vorhanden).
- **Live-Nachtest nach Einspielen von 0007 (04.11.2026, 09:06):** C entfernt →
  Wiedereintritt mit altem Code abgelehnt; Außenstehender erhält für Mitglied
  und Nicht-Mitglied gleichermaßen `not_authorized`; `group_member_removals`
  für Clients nicht lesbar; mit neuer Einladung ist C wieder aufgenommen.
  Alle 6 Prüfungen bestanden.

## Empfehlung

Migration 0007 ist eingespielt, der Live-Nachtest ist bestanden. Phase 1 ist
aus Sicherheitssicht **bereit für Phase 2**.
