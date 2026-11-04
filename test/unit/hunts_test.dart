import 'package:drueckjagd_app/features/groups/domain/group_role.dart';
import 'package:drueckjagd_app/features/hunts/domain/geo_point.dart';
import 'package:drueckjagd_app/features/hunts/domain/hunt.dart';
import 'package:drueckjagd_app/features/hunts/domain/hunt_enums.dart';
import 'package:drueckjagd_app/features/hunts/domain/hunt_participant.dart';
import 'package:drueckjagd_app/features/hunts/domain/hunt_permissions.dart';
import 'package:drueckjagd_app/features/hunts/domain/hunt_report.dart';
import 'package:drueckjagd_app/features/hunts/domain/hunt_stand.dart';
import 'package:drueckjagd_app/features/hunts/domain/hunt_zone.dart';
import 'package:flutter_test/flutter_test.dart';

const _ts = '2026-11-21T08:00:00Z';

Map<String, dynamic> _huntJson({String status = 'geplant', bool selfJoin = true}) => {
  'id': 'h1',
  'group_id': 'g1',
  'revier_id': 'r1',
  'title': 'Drückjagd Eichenhain',
  'description': null,
  'starts_at': _ts,
  'ends_at': null,
  'status': status,
  'meeting_point': 'Forsthaus',
  'meeting_latitude': 51.5,
  'meeting_longitude': 9.5,
  'game_release': 'Schwarzwild',
  'safety_notes': 'Signalkleidung',
  'emergency_info': '112',
  'self_join': selfJoin,
  'created_by': 'u1',
  'created_at': _ts,
  'updated_at': _ts,
  'group': {'name': 'Hegering'},
  'revier': {'name': 'Eichenhain'},
};

HuntParticipant _participant(HuntRole role, {String userId = 'me'}) =>
    HuntParticipant(id: 'p-$userId', huntId: 'h1', userId: userId, role: role);

void main() {
  group('Enums entsprechen der Datenbank (Migration 0010)', () {
    test('HuntStatus', () {
      expect(HuntStatus.values.map((e) => e.value), ['geplant', 'laufend', 'beendet', 'abgesagt']);
    });
    test('HuntRole', () {
      expect(HuntRole.values.map((e) => e.value), [
        'jagdleiter',
        'ansteller',
        'schuetze',
        'treiber',
        'hundefuehrer',
        'bergung',
        'sonstige',
      ]);
      expect(HuntRole.selfAssignable, isNot(contains(HuntRole.jagdleiter)));
      expect(HuntRole.selfAssignable, isNot(contains(HuntRole.ansteller)));
    });
    test('HuntZoneKind', () {
      expect(HuntZoneKind.values.map((e) => e.value), [
        'treiben',
        'sicherheitszone',
        'sperrzone',
        'sammelplatz',
        'sonstiges',
      ]);
    });
    test('HuntReportKind', () {
      expect(HuntReportKind.values.map((e) => e.value), [
        'erlegt',
        'angeschossen',
        'ueberschossen',
        'anblick',
        'sonstiges',
      ]);
    });
    test('unbekannte Werte fallen auf einen sicheren Standard zurück', () {
      expect(HuntRole.fromValue('neu'), HuntRole.sonstige);
      expect(HuntReportKind.fromValue('neu'), HuntReportKind.sonstiges);
      expect(HuntZoneKind.fromValue('neu'), HuntZoneKind.sonstiges);
    });
  });

  group('Modelle', () {
    test('Hunt.fromJson', () {
      final h = Hunt.fromJson(_huntJson());
      expect(h.description, '');
      expect(h.endsAt, isNull);
      expect(h.meetingLocation, const GeoPoint(51.5, 9.5));
      expect(h.groupName, 'Hegering');
      expect(h.revierName, 'Eichenhain');
      expect(h.canSelfJoin, isTrue);
    });

    test('Selbsteintragung nur bei offener Jagd mit Freigabe', () {
      expect(Hunt.fromJson(_huntJson(status: 'laufend')).canSelfJoin, isTrue);
      expect(Hunt.fromJson(_huntJson(status: 'beendet')).canSelfJoin, isFalse);
      expect(Hunt.fromJson(_huntJson(status: 'abgesagt')).canSelfJoin, isFalse);
      expect(Hunt.fromJson(_huntJson(selfJoin: false)).canSelfJoin, isFalse);
    });

    test('Hunt.fromJson ohne Treffpunktkoordinaten', () {
      final json = _huntJson()
        ..['meeting_latitude'] = null
        ..['meeting_longitude'] = null;
      expect(Hunt.fromJson(json).meetingLocation, isNull);
    });

    test('HuntDraft.toJson trimmt Texte und schreibt UTC', () {
      final json = HuntDraft(
        title: '  Drückjagd  ',
        startsAt: DateTime.utc(2026, 11, 21, 8),
        meetingLocation: const GeoPoint(51.5, 9.5),
      ).toJson();
      expect(json['title'], 'Drückjagd');
      expect(json['starts_at'], '2026-11-21T08:00:00.000Z');
      expect(json['meeting_latitude'], 51.5);
      expect(json['status'], 'geplant');
      expect(json, isNot(contains('group_id')));
      expect(json, isNot(contains('created_by')));
    });

    test('HuntParticipant.name fällt auf den Benutzernamen zurück', () {
      final p = HuntParticipant.fromJson({
        'id': 'p1',
        'hunt_id': 'h1',
        'user_id': 'u1',
        'role': 'schuetze',
        'stand_id': 's1',
        'zone_id': null,
        'note': null,
        'profile': {'display_name': ' ', 'username': 'jaeger_1'},
      });
      expect(p.name, '@jaeger_1');
      expect(p.role, HuntRole.schuetze);
      expect(p.standId, 's1');
    });

    test('HuntStand.fromJson', () {
      final s = HuntStand.fromJson({
        'id': 's1',
        'hunt_id': 'h1',
        'label': 'Stand 1',
        'waypoint_id': 'w1',
        'zone_id': null,
        'latitude': 51.5,
        'longitude': 9,
        'description': 'Schussrichtung Nord',
        'sort_order': 3,
      });
      expect(s.location, const GeoPoint(51.5, 9));
      expect(s.sortOrder, 3);
    });

    test('HuntZone.fromJson', () {
      final z = HuntZone.fromJson({
        'id': 'z1',
        'hunt_id': 'h1',
        'name': 'Treiben 1',
        'kind': 'treiben',
        'description': '',
        'color': '#2E7D32',
        'boundary_data': {'type': 'MultiPolygon', 'coordinates': <Object>[]},
      });
      expect(z.kind, HuntZoneKind.treiben);
      expect(z.boundary['type'], 'MultiPolygon');
      expect(HuntZone.columns, isNot(contains('geom')));
    });

    test('HuntReport: offene Nachsuche', () {
      Map<String, dynamic> json(String kind, String? resolved) => {
        'id': 'm1',
        'hunt_id': 'h1',
        'reporter_id': 'u1',
        'kind': kind,
        'species': 'Schwarzwild',
        'count': 1,
        'stand_id': null,
        'latitude': null,
        'longitude': null,
        'note': '',
        'occurred_at': _ts,
        'resolved_at': resolved,
        'resolved_by': null,
        'reporter': {'display_name': 'Chris'},
      };
      final open = HuntReport.fromJson(json('angeschossen', null));
      expect(open.isOpenFollowUp, isTrue);
      expect(open.location, isNull);
      expect(open.reporterName, 'Chris');
      expect(HuntReport.fromJson(json('angeschossen', _ts)).isOpenFollowUp, isFalse);
      expect(HuntReport.fromJson(json('erlegt', null)).isOpenFollowUp, isFalse);
    });

    test('HuntReportDraft.toJson setzt keinen Melder (Server-Standard)', () {
      final json = const HuntReportDraft(huntId: 'h1', kind: HuntReportKind.erlegt, species: ' Rehwild ').toJson();
      expect(json['kind'], 'erlegt');
      expect(json['species'], 'Rehwild');
      expect(json, isNot(contains('reporter_id')));
      expect(json, isNot(contains('occurred_at')));
    });
  });

  group('HuntPermissions spiegelt die Serverregeln', () {
    final hunt = Hunt.fromJson(_huntJson());

    test('Mitglied ohne Teilnahme', () {
      const p = HuntPermissions(userId: 'me', groupRole: GroupRole.member);
      expect(p.canManage, isFalse);
      expect(p.canDelete, isFalse);
      expect(p.canSelfJoin(hunt), isTrue);
      expect(p.canReport, isTrue);
    });

    test('Schütze darf nicht leiten, nur eigene Meldungen ändern', () {
      final p = HuntPermissions(
        userId: 'me',
        groupRole: GroupRole.member,
        participation: _participant(HuntRole.schuetze),
      );
      expect(p.canManage, isFalse);
      expect(p.canSelfJoin(hunt), isFalse, reason: 'bereits eingetragen');
      final own = HuntReport(
        id: 'm',
        huntId: 'h1',
        kind: HuntReportKind.erlegt,
        occurredAt: DateTime(2026),
        reporterId: 'me',
      );
      final other = HuntReport(
        id: 'n',
        huntId: 'h1',
        kind: HuntReportKind.erlegt,
        occurredAt: DateTime(2026),
        reporterId: 'x',
      );
      expect(p.canEditReport(own), isTrue);
      expect(p.canEditReport(other), isFalse);
    });

    test('Jagdleiter (Mitglied) leitet, löscht aber nicht', () {
      final p = HuntPermissions(
        userId: 'me',
        groupRole: GroupRole.member,
        participation: _participant(HuntRole.jagdleiter),
      );
      expect(p.canManage, isTrue);
      expect(p.canAppointLeader, isTrue);
      expect(p.canDelete, isFalse);
    });

    test('Ansteller leitet, ernennt aber keine Jagdleiter', () {
      final p = HuntPermissions(
        userId: 'me',
        groupRole: GroupRole.member,
        participation: _participant(HuntRole.ansteller),
      );
      expect(p.canManage, isTrue);
      expect(p.canAppointLeader, isFalse);
    });

    test('Owner/Admin leiten jede Jagd der Gruppe', () {
      for (final role in [GroupRole.owner, GroupRole.admin]) {
        final p = HuntPermissions(userId: 'me', groupRole: role);
        expect(p.canManage, isTrue);
        expect(p.canDelete, isTrue);
        expect(p.canAppointLeader, isTrue);
      }
    });

    test('Außenstehender darf nichts', () {
      const p = HuntPermissions(userId: 'me', groupRole: null);
      expect(p.canSelfJoin(hunt), isFalse);
      expect(p.canReport, isFalse);
      expect(p.canManage, isFalse);
    });
  });
}
