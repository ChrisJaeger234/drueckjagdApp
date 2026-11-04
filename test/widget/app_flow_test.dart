import 'package:drueckjagd_app/features/authentication/domain/app_user.dart';
import 'package:drueckjagd_app/features/groups/domain/group_role.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fakes.dart';
import '../support/test_app.dart';

Future<void> _enter(WidgetTester tester, String label, String text) async {
  await tester.enterText(find.widgetWithText(TextFormField, label), text);
}

void main() {
  // Smartphone-Format (432 × 960 logische Pixel), damit Formulare ganz sichtbar sind.
  setUp(() {
    final binding = TestWidgetsFlutterBinding.ensureInitialized();
    binding.platformDispatcher.implicitView!
      ..physicalSize = const Size(1080, 2400)
      ..devicePixelRatio = 2.5;
  });
  tearDown(() => TestWidgetsFlutterBinding.instance.platformDispatcher.implicitView!.reset());

  testWidgets('Start ohne Sitzung führt zur Anmeldung', (tester) async {
    await tester.pumpWidget(TestApp().build());
    await tester.pumpAndSettle();
    expect(find.text('Anmelden'), findsWidgets);
    expect(find.text('Willkommen zurück. Melde dich mit deinem Konto an.'), findsOneWidget);
  });

  testWidgets('Anmeldung: Validierung, Fehler, Erfolg', (tester) async {
    final app = TestApp();
    await tester.pumpWidget(app.build());
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Anmelden'));
    await tester.pumpAndSettle();
    expect(find.text('Bitte gib deine E-Mail-Adresse ein.'), findsOneWidget);
    expect(app.auth.signInCalls, 0, reason: 'Ungültige Formulare werden nicht abgeschickt');

    await _enter(tester, 'E-Mail', 'jaeger@example.de');
    await _enter(tester, 'Passwort', 'falsch');
    await tester.tap(find.widgetWithText(FilledButton, 'Anmelden'));
    await tester.pumpAndSettle();
    expect(find.text('E-Mail-Adresse oder Passwort ist falsch.'), findsOneWidget);

    await _enter(tester, 'Passwort', 'geheim123');
    await tester.tap(find.widgetWithText(FilledButton, 'Anmelden'));
    await tester.pumpAndSettle();
    expect(find.text('Übersicht'), findsWidgets);
    expect(find.text('Starte mit deiner Gruppe'), findsOneWidget);
  });

  testWidgets('Registrierung mit E-Mail-Bestätigung zeigt Erfolgszustand', (tester) async {
    final app = TestApp(auth: FakeAuthRepository(requireConfirmation: true));
    await tester.pumpWidget(app.build());
    await tester.pumpAndSettle();
    await tester.tap(find.text('Noch kein Konto? Jetzt registrieren'));
    await tester.pumpAndSettle();

    await _enter(tester, 'E-Mail', 'neu@example.de');
    await _enter(tester, 'Passwort', 'waidmann1');
    await _enter(tester, 'Passwort bestätigen', 'waidmann2');
    await tester.tap(find.widgetWithText(FilledButton, 'Registrieren'));
    await tester.pumpAndSettle();
    expect(find.text('Die Passwörter stimmen nicht überein.'), findsOneWidget);

    await _enter(tester, 'Passwort bestätigen', 'waidmann1');
    await tester.tap(find.widgetWithText(FilledButton, 'Registrieren'));
    await tester.pumpAndSettle();
    expect(find.text('Fast geschafft'), findsOneWidget);
    expect(find.textContaining('neu@example.de'), findsOneWidget);
  });

  testWidgets('Angemeldet: Gruppe erstellen, Revier anlegen, Vorschau-Tabs', (tester) async {
    final app = TestApp(auth: FakeAuthRepository(signedIn: const AppUser(id: 'user-1', email: 'j@example.de')));
    await tester.pumpWidget(app.build());
    await tester.pumpAndSettle();
    expect(find.text('Starte mit deiner Gruppe'), findsOneWidget);

    // Gruppe erstellen
    await tester.tap(find.widgetWithText(FilledButton, 'Gruppe erstellen'));
    await tester.pumpAndSettle();
    await _enter(tester, 'Gruppenname', 'Jagdfreunde Hochwald');
    await tester.tap(find.widgetWithText(FilledButton, 'Gruppe erstellen'));
    await tester.pumpAndSettle();

    expect(app.groups.groups.values.single.name, 'Jagdfreunde Hochwald');
    expect(app.groups.roles.values.single['user-1'], GroupRole.owner);
    expect(find.text('Jagdfreunde Hochwald'), findsWidgets);
    expect(find.text('Einladungscode erstellen'), findsOneWidget, reason: 'Owner darf einladen');

    // Revier anlegen
    await tester.tap(find.widgetWithText(TextButton, 'Neu'));
    await tester.pumpAndSettle();
    await _enter(tester, 'Reviername', 'Revier Nord');
    await tester.tap(find.widgetWithText(FilledButton, 'Revier anlegen'));
    await tester.pumpAndSettle();
    expect(app.reviere.reviere.single.name, 'Revier Nord');
    expect(find.text('Karte & Reviergrenzen'), findsOneWidget);

    // Vorschau-Bereiche sind klar gekennzeichnet
    await tester.tap(find.text('Karte').last);
    await tester.pumpAndSettle();
    expect(find.text('In Vorbereitung · Phase 2'), findsOneWidget);
    await tester.tap(find.text('Chat').last);
    await tester.pumpAndSettle();
    expect(find.text('Gruppenchat & Meldungen'), findsOneWidget);
  });

  testWidgets('Member sieht keine Verwaltungsfunktionen', (tester) async {
    final app = TestApp(auth: FakeAuthRepository(signedIn: const AppUser(id: 'user-1', email: 'j@example.de')));
    final group = await app.groups.createGroup(name: 'Fremde Gruppe', description: '');
    app.groups.roles[group.id] = {'owner-x': GroupRole.owner, 'user-1': GroupRole.member};

    await tester.pumpWidget(app.build());
    await tester.pumpAndSettle();
    await tester.tap(find.text('Fremde Gruppe'));
    await tester.pumpAndSettle();

    expect(find.text('Einladungscode erstellen'), findsNothing);
    expect(find.widgetWithText(TextButton, 'Neu'), findsNothing);
    expect(find.text('Ein Owner oder Admin kann Reviere anlegen.'), findsOneWidget);
  });

  testWidgets('Profil bearbeiten und abmelden', (tester) async {
    final app = TestApp(auth: FakeAuthRepository(signedIn: const AppUser(id: 'user-1', email: 'j@example.de')));
    await tester.pumpWidget(app.build());
    await tester.pumpAndSettle();

    await tester.tap(find.text('Profil').last);
    await tester.pumpAndSettle();
    expect(find.text('Profil vervollständigen'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Profil bearbeiten'));
    await tester.pumpAndSettle();
    await _enter(tester, 'Anzeigename', 'Max Jäger');
    await _enter(tester, 'Benutzername', 'Max!');
    await tester.tap(find.widgetWithText(FilledButton, 'Speichern'));
    await tester.pumpAndSettle();
    expect(find.text('3–24 Zeichen, nur Kleinbuchstaben, Ziffern und Unterstrich.'), findsOneWidget);

    await _enter(tester, 'Benutzername', 'max_jaeger');
    await tester.tap(find.widgetWithText(FilledButton, 'Speichern'));
    await tester.pumpAndSettle();
    expect(app.profiles.profiles['user-1']!.username, 'max_jaeger');
    expect(find.text('@max_jaeger'), findsWidgets);

    await tester.tap(find.widgetWithText(OutlinedButton, 'Abmelden'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Abmelden'));
    await tester.pumpAndSettle();
    expect(find.text('Willkommen zurück. Melde dich mit deinem Konto an.'), findsOneWidget);
  });

  testWidgets('Mit Einladungscode beitreten', (tester) async {
    final app = TestApp(auth: FakeAuthRepository(signedIn: const AppUser(id: 'user-1', email: 'j@example.de')));
    final group = await app.groups.createGroup(name: 'Nachbarrevier', description: '');
    app.groups.roles[group.id] = {'owner-x': GroupRole.owner};
    final invite = await app.groups.createInvite(groupId: group.id);

    await tester.pumpWidget(app.build());
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(OutlinedButton, 'Mit Code beitreten'));
    await tester.pumpAndSettle();

    await _enter(tester, 'Einladungscode', 'kurz');
    await tester.tap(find.widgetWithText(FilledButton, 'Beitreten'));
    await tester.pumpAndSettle();
    expect(find.textContaining('12 Zeichen'), findsOneWidget);

    await _enter(tester, 'Einladungscode', invite.code);
    await tester.tap(find.widgetWithText(FilledButton, 'Beitreten'));
    await tester.pumpAndSettle();
    expect(app.groups.roles[group.id]!['user-1'], GroupRole.member);
    expect(find.text('Nachbarrevier'), findsWidgets);
  });
}
