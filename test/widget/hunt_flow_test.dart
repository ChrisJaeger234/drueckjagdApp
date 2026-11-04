import 'package:drueckjagd_app/features/authentication/domain/app_user.dart';
import 'package:drueckjagd_app/features/groups/domain/group_role.dart';
import 'package:drueckjagd_app/features/hunts/domain/hunt.dart';
import 'package:drueckjagd_app/features/hunts/domain/hunt_enums.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fakes.dart';
import '../support/test_app.dart';

Future<void> _enter(WidgetTester tester, String label, String text) async {
  await tester.enterText(find.widgetWithText(TextFormField, label), text);
}

Future<void> _scrollTo(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(finder, 300, scrollable: find.byType(Scrollable).first);
  await tester.pumpAndSettle();
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await tester.pumpAndSettle();
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

TestApp _signedIn() => TestApp(
  auth: FakeAuthRepository(
    signedIn: const AppUser(id: 'user-1', email: 'j@example.de'),
  ),
);

void main() {
  setUp(() {
    final binding = TestWidgetsFlutterBinding.ensureInitialized();
    binding.platformDispatcher.implicitView!
      ..physicalSize = const Size(1080, 2400)
      ..devicePixelRatio = 2.5;
  });
  tearDown(() => TestWidgetsFlutterBinding.instance.platformDispatcher.implicitView!.reset());

  testWidgets('Owner legt Jagd und Stand an, teilt zu und meldet „erlegt“', (tester) async {
    final app = _signedIn();
    final group = await app.groups.createGroup(name: 'Hegering Nord', description: '');

    await tester.pumpWidget(app.build());
    await tester.pumpAndSettle();
    await tester.tap(find.text('Hegering Nord'));
    await tester.pumpAndSettle();
    expect(find.text('Noch keine Jagd'), findsOneWidget);

    // Jagd anlegen
    await tester.tap(find.widgetWithText(TextButton, 'Jagd'));
    await tester.pumpAndSettle();
    await _tap(tester, find.widgetWithText(FilledButton, 'Jagd anlegen'));
    expect(find.text('Bitte gib einen Titel ein.'), findsOneWidget);
    await _enter(tester, 'Titel', 'Drückjagd Eichenhain');
    await _enter(tester, 'Freigabe', 'Schwarzwild, Rehwild weiblich');
    await _tap(tester, find.widgetWithText(FilledButton, 'Jagd anlegen'));

    final hunt = app.hunts.hunts.values.single;
    expect(hunt.groupId, group.id);
    expect(hunt.gameRelease, 'Schwarzwild, Rehwild weiblich');
    expect(find.text('Du bist dabei als Jagdleiter'), findsOneWidget);
    expect(find.text('Schwarzwild, Rehwild weiblich'), findsOneWidget);

    // Stand anlegen (Koordinaten wie aus Google Maps kopiert)
    await _scrollTo(tester, find.widgetWithText(TextButton, 'Stand'));
    await tester.tap(find.widgetWithText(TextButton, 'Stand'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextFormField, 'Stand 1'), findsOneWidget, reason: 'Bezeichnung vorbelegt');
    await _enter(tester, 'Koordinaten', 'irgendwo');
    await _tap(tester, find.widgetWithText(FilledButton, 'Stand anlegen'));
    expect(find.textContaining('Breite, Länge'), findsWidgets);
    await _enter(tester, 'Koordinaten', '51.16868205981034, 7.24749484403816');
    await _tap(tester, find.widgetWithText(FilledButton, 'Stand anlegen'));
    final stand = app.hunts.stands.single;
    expect(stand.label, 'Stand 1');
    expect(stand.location.latitude, closeTo(51.16868, 1e-5));

    // Sich selbst den Stand zuteilen
    await _scrollTo(tester, find.textContaining('(du)'));
    await tester.tap(find.byTooltip('Teilnahme verwalten'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Stand zuteilen'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Stand 1').last);
    await tester.pumpAndSettle();
    expect(app.hunts.participants.single.standId, stand.id);

    // Schnellmeldung
    await tester.scrollUntilVisible(find.text('Melden').first, -300, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    expect(find.text('Dein Stand: Stand 1'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Erlegt'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ChoiceChip, 'Schwarzwild'));
    await tester.pumpAndSettle();
    await _tap(tester, find.widgetWithText(FilledButton, 'Melden'));

    final report = app.hunts.reports.single;
    expect(report.kind, HuntReportKind.erlegt);
    expect(report.species, 'Schwarzwild');
    expect(report.standId, stand.id, reason: 'eigener Stand ist vorausgewählt');
    expect(find.textContaining('Schwarzwild erlegt'), findsOneWidget);
  });

  testWidgets('Mitglied trägt sich selbst ein, sieht aber keine Leitungsfunktionen', (tester) async {
    final app = _signedIn();
    final group = await app.groups.createGroup(name: 'Nachbarrevier', description: '');
    app.groups.roles[group.id] = {'owner-x': GroupRole.owner, 'user-1': GroupRole.member};
    app.hunts.seed(
      groupId: group.id,
      createdBy: 'owner-x',
      draft: HuntDraft(title: 'Drückjagd Buchenhang', startsAt: DateTime.now().add(const Duration(days: 3))),
    );

    await tester.pumpWidget(app.build());
    await tester.pumpAndSettle();

    // Anstehende Jagd erscheint in der Übersicht
    expect(find.text('ANSTEHENDE JAGDEN'), findsOneWidget);
    await tester.tap(find.text('Drückjagd Buchenhang'));
    await tester.pumpAndSettle();

    expect(find.byTooltip('Jagd verwalten'), findsNothing);
    expect(find.widgetWithText(TextButton, 'Stand'), findsNothing);
    expect(find.text('Die Jagdleitung legt die Stände an.'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Ich bin dabei'));
    await tester.pumpAndSettle();
    final sheet = find.byType(BottomSheet);
    expect(
      find.descendant(of: sheet, matching: find.text('Jagdleiter')),
      findsNothing,
      reason: 'Leitungsrollen nicht selbst wählbar',
    );
    expect(find.descendant(of: sheet, matching: find.text('Ansteller')), findsNothing);
    expect(find.descendant(of: sheet, matching: find.text('Schütze')), findsOneWidget);
    await tester.tap(find.text('Treiber'));
    await tester.pumpAndSettle();

    final me = app.hunts.participants.firstWhere((p) => p.userId == 'user-1');
    expect(me.role, HuntRole.treiber);
    expect(find.text('Du bist dabei als Treiber'), findsOneWidget);
  });

  testWidgets('Ohne Selbsteintragung kein „Ich bin dabei“', (tester) async {
    final app = _signedIn();
    final group = await app.groups.createGroup(name: 'Privatjagd', description: '');
    app.groups.roles[group.id] = {'owner-x': GroupRole.owner, 'user-1': GroupRole.member};
    final hunt = app.hunts.seed(
      groupId: group.id,
      createdBy: 'owner-x',
      draft: HuntDraft(title: 'Geladene Jagd', startsAt: DateTime.now().add(const Duration(days: 3)), selfJoin: false),
    );

    await tester.pumpWidget(app.build());
    await tester.pumpAndSettle();
    await tester.tap(find.text(hunt.title));
    await tester.pumpAndSettle();
    expect(find.text('Ich bin dabei'), findsNothing);
    expect(find.text('Die Jagdleitung trägt die Teilnehmer selbst ein.'), findsOneWidget);
  });
}
