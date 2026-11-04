import 'package:drueckjagd_app/core/geo/geo_point.dart';
import 'package:drueckjagd_app/features/authentication/domain/app_user.dart';
import 'package:drueckjagd_app/features/groups/domain/group_role.dart';
import 'package:drueckjagd_app/features/hunting_grounds/domain/revier.dart';
import 'package:drueckjagd_app/features/hunts/domain/hunt.dart';
import 'package:drueckjagd_app/features/map/domain/waypoint.dart';
import 'package:drueckjagd_app/features/map/domain/waypoint_category.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fakes.dart';
import '../support/test_app.dart';

const _square = {
  'type': 'MultiPolygon',
  'coordinates': [
    [
      [
        [7.24, 51.165],
        [7.2543, 51.165],
        [7.2543, 51.174],
        [7.24, 51.174],
        [7.24, 51.165],
      ],
    ],
  ],
};

TestApp _signedIn() => TestApp(
  auth: FakeAuthRepository(
    signedIn: const AppUser(id: 'user-1', email: 'j@example.de'),
  ),
);

/// Gruppe mit Revier, Grenze und einer Einrichtung. [role] ist die eigene Rolle.
Future<(TestApp, Revier)> _setup({GroupRole role = GroupRole.owner}) async {
  final app = _signedIn();
  final group = await app.groups.createGroup(name: 'Hegering Nord', description: '');
  if (role != GroupRole.owner) app.groups.roles[group.id] = {'owner-x': GroupRole.owner, 'user-1': role};
  final revier = await app.reviere.create(groupId: group.id, createdBy: 'owner-x', name: 'Eichenhain', description: '');
  await app.map.replaceBoundary(revierId: revier.id, geojson: _square);
  app.map.seedWaypoint(
    revierId: revier.id,
    createdBy: 'owner-x',
    draft: const WaypointDraft(
      name: 'Bock am Bach',
      category: WaypointCategory.drueckjagdbock,
      location: GeoPoint(51.168, 7.247),
    ),
  );
  return (app, revier);
}

Future<void> _openMapTab(WidgetTester tester) async {
  await tester.tap(find.text('Karte').last);
  await tester.pumpAndSettle();
}

Future<void> _tapButton(WidgetTester tester, Finder finder) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await tester.pumpAndSettle();
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  setUp(() {
    final binding = TestWidgetsFlutterBinding.ensureInitialized();
    binding.platformDispatcher.implicitView!
      ..physicalSize = const Size(1080, 2400)
      ..devicePixelRatio = 2.5;
  });
  tearDown(() => TestWidgetsFlutterBinding.instance.platformDispatcher.implicitView!.reset());

  testWidgets('Owner sieht Revierkarte und legt per Langdruck eine Einrichtung an', (tester) async {
    final (app, revier) = await _setup();
    await tester.pumpWidget(app.build());
    await tester.pumpAndSettle();
    await _openMapTab(tester);

    expect(find.byType(FlutterMap), findsOneWidget);
    expect(find.text('Eichenhain'), findsOneWidget);
    expect(find.text('Bock am Bach'), findsOneWidget);
    expect(find.text('100 ha · 1 Einrichtungen · lange drücken: neue Einrichtung'), findsOneWidget);

    // Details der Einrichtung
    await tester.tap(find.text('Bock am Bach'));
    await tester.pumpAndSettle();
    expect(find.text('Drückjagdbock'), findsWidgets);
    expect(find.text('51.168000, 7.247000'), findsOneWidget);
    expect(find.widgetWithText(OutlinedButton, 'Bearbeiten'), findsOneWidget, reason: 'Owner darf bearbeiten');
    Navigator.of(tester.element(find.text('51.168000, 7.247000'))).pop();
    await tester.pumpAndSettle();

    // Neue Einrichtung
    await tester.longPress(find.byType(FlutterMap));
    await tester.pumpAndSettle();
    expect(find.text('Einrichtung anlegen'), findsOneWidget);
    await tester.tap(find.widgetWithText(ChoiceChip, 'Kanzel'));
    await tester.enterText(find.widgetWithText(TextFormField, 'Name'), 'Kanzel Eichenhang');
    await _tapButton(tester, find.widgetWithText(FilledButton, 'Speichern'));

    final created = app.map.waypoints.last;
    expect(created.name, 'Kanzel Eichenhang');
    expect(created.category, WaypointCategory.kanzel);
    expect(created.revierId, revier.id);
    expect(find.text('Kanzel Eichenhang'), findsOneWidget);
  });

  testWidgets('Owner zeichnet die Reviergrenze neu', (tester) async {
    final (app, revier) = await _setup();
    await tester.pumpWidget(app.build());
    await tester.pumpAndSettle();
    await _openMapTab(tester);

    await tester.tap(find.byTooltip('Kartenmenü'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Reviergrenze neu zeichnen'));
    await tester.pumpAndSettle();
    expect(find.text('Reviergrenze zeichnen'), findsOneWidget);

    final center = tester.getCenter(find.byType(FlutterMap));
    for (final offset in const [Offset(-100, -100), Offset(100, -100), Offset(100, 100), Offset(-100, 100)]) {
      await tester.tapAt(center + offset);
      await tester.pump(const Duration(milliseconds: 400));
    }
    await tester.pumpAndSettle();
    expect(find.textContaining('4 Eckpunkte'), findsOneWidget);

    await tester.tap(find.byTooltip('Letzten Punkt entfernen'));
    await tester.pumpAndSettle();
    expect(find.textContaining('3 Eckpunkte'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Fertig'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Ersetzen'));
    await tester.pumpAndSettle();

    final boundary = app.map.boundaries.single;
    expect(boundary.revierId, revier.id);
    expect(boundary.polygons.single.outer, hasLength(3));
    expect(find.textContaining('Reviergrenze gespeichert'), findsOneWidget);
  });

  testWidgets('Mitglied sieht die Karte, kann aber nichts anlegen', (tester) async {
    final (app, _) = await _setup(role: GroupRole.member);
    await tester.pumpWidget(app.build());
    await tester.pumpAndSettle();
    await _openMapTab(tester);

    expect(find.text('Bock am Bach'), findsOneWidget);
    expect(find.textContaining('lange drücken'), findsNothing);

    await tester.longPress(find.byType(FlutterMap));
    await tester.pumpAndSettle();
    expect(find.text('Einrichtung anlegen'), findsNothing);
    expect(find.text('Einrichtungen legen Owner und Admins der Gruppe an.'), findsOneWidget);

    await tester.tap(find.byTooltip('Kartenmenü'));
    await tester.pumpAndSettle();
    expect(find.text('Ganzes Revier zeigen'), findsOneWidget);
    expect(find.text('Reviergrenze neu zeichnen'), findsNothing);
  });

  testWidgets('Eigener Standort erscheint nach Tipp auf „Mein Standort“', (tester) async {
    final (app, _) = await _setup(role: GroupRole.member);
    await tester.pumpWidget(app.build());
    await tester.pumpAndSettle();
    await _openMapTab(tester);

    expect(find.byType(CircleLayer), findsNothing);
    await tester.tap(find.byTooltip('Mein Standort'));
    await tester.pumpAndSettle();
    expect(find.byType(CircleLayer), findsOneWidget, reason: 'Genauigkeitskreis um die Position');
  });

  testWidgets('Jagdleitung setzt Stand auf der Jagdkarte und zeichnet ein Treiben', (tester) async {
    final (app, revier) = await _setup();
    final hunt = app.hunts.seed(
      groupId: revier.groupId,
      createdBy: 'user-1',
      draft: HuntDraft(
        title: 'Drückjagd Eichenhain',
        revierId: revier.id,
        startsAt: DateTime.now().add(const Duration(days: 3)),
      ),
    );
    await tester.pumpWidget(app.build());
    await tester.pumpAndSettle();
    await tester.tap(find.text('Drückjagd Eichenhain'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Jagdkarte'));
    await tester.pumpAndSettle();

    expect(find.byType(FlutterMap), findsOneWidget);
    expect(find.textContaining('0 Stände'), findsOneWidget);

    // Einrichtung als Stand übernehmen
    await tester.tap(find.bySemanticsLabel('Drückjagdbock Bock am Bach'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Als Stand für diese Jagd übernehmen'));
    await tester.pumpAndSettle();
    expect(find.text('Stand anlegen'), findsWidgets);
    expect(find.widgetWithText(TextFormField, 'Bock am Bach'), findsOneWidget);
    await _tapButton(tester, find.widgetWithText(FilledButton, 'Stand anlegen'));

    final stand = app.hunts.stands.single;
    expect(stand.huntId, hunt.id);
    expect(stand.label, 'Bock am Bach');
    expect(stand.waypointId, app.map.waypoints.single.id);
    expect(stand.location, const GeoPoint(51.168, 7.247));
    expect(find.textContaining('1 Stände'), findsOneWidget);

    // Langdruck setzt einen freien Stand
    await tester.longPress(find.byType(FlutterMap));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextFormField, 'Stand 2'), findsOneWidget);
    await _tapButton(tester, find.widgetWithText(FilledButton, 'Stand anlegen'));
    expect(app.hunts.stands, hasLength(2));

    // Treiben zeichnen
    await tester.tap(find.byTooltip('Kartenmenü'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Zone zeichnen'));
    await tester.pumpAndSettle();
    final center = tester.getCenter(find.byType(FlutterMap));
    for (final offset in const [Offset(-150, -250), Offset(150, -250), Offset(0, -350)]) {
      await tester.tapAt(center + offset);
      await tester.pump(const Duration(milliseconds: 400));
    }
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Fertig'));
    await tester.pumpAndSettle();
    expect(find.text('Zone speichern'), findsOneWidget);
    await _tapButton(tester, find.widgetWithText(FilledButton, 'Speichern'));

    final zone = app.hunts.zones.single;
    expect(zone.name, 'Treiben 1');
    expect(find.textContaining('1 Zonen'), findsOneWidget);
  });
}
