import 'package:drueckjagd_app/features/groups/domain/group_invite.dart';
import 'package:drueckjagd_app/features/groups/domain/group_role.dart';
import 'package:drueckjagd_app/features/groups/domain/hunting_group.dart';
import 'package:drueckjagd_app/features/hunting_grounds/domain/revier.dart';
import 'package:drueckjagd_app/features/map/domain/waypoint_category.dart';
import 'package:drueckjagd_app/features/profile/domain/profile.dart';
import 'package:flutter_test/flutter_test.dart';

const _ts = '2026-11-04T06:00:00.000Z';

Map<String, dynamic> _profileJson({String? username = 'max', String displayName = 'Max'}) => {
  'id': 'u1',
  'username': username,
  'display_name': displayName,
  'avatar_url': null,
  'created_at': _ts,
  'updated_at': _ts,
};

Map<String, dynamic> _groupJson() => {
  'id': 'g1',
  'name': 'Jagdfreunde',
  'description': 'Test',
  'created_by': 'u1',
  'admins_can_manage_members': false,
  'created_at': _ts,
  'updated_at': _ts,
};

void main() {
  group('Profile', () {
    test('fromJson und Anzeige', () {
      final p = Profile.fromJson(_profileJson());
      expect(p.username, 'max');
      expect(p.label, 'Max');
      expect(p.isComplete, isTrue);
      expect(p.createdAt, DateTime.parse(_ts));
    });
    test('unvollständiges Profil fällt auf Benutzernamen zurück', () {
      final p = Profile.fromJson(_profileJson(displayName: ''));
      expect(p.label, '@max');
      expect(p.isComplete, isFalse);
      expect(Profile.fromJson(_profileJson(username: null, displayName: '')).label, 'Unbenannt');
    });
    test('toUpdateJson enthält nur änderbare Spalten', () {
      final json = Profile.fromJson(_profileJson()).toUpdateJson();
      expect(json.keys, unorderedEquals(['username', 'display_name', 'avatar_url']));
    });
  });

  group('Gruppen', () {
    test('HuntingGroup.fromJson', () {
      final g = HuntingGroup.fromJson(_groupJson());
      expect(g.name, 'Jagdfreunde');
      expect(g.adminsCanManageMembers, isFalse);
    });
    test('MyGroup aus Mitgliedschaft mit eingebetteter Gruppe', () {
      final my = MyGroup.fromMembershipJson({'role': 'admin', 'group': _groupJson()});
      expect(my.role, GroupRole.admin);
      expect(my.permissions.canManageMembers, isFalse, reason: 'Owner hat Admins die Verwaltung entzogen');
      expect(my.permissions.canEditRevier, isTrue);
    });
    test('GroupMember mit Profil', () {
      final m = GroupMember.fromJson({
        'id': 'm1',
        'group_id': 'g1',
        'user_id': 'u1',
        'role': 'owner',
        'joined_at': _ts,
        'profile': _profileJson(),
      });
      expect(m.role, GroupRole.owner);
      expect(m.label, 'Max');
    });
    test('unbekannte Rolle wirft FormatException', () {
      expect(() => GroupRole.fromValue('king'), throwsFormatException);
    });
  });

  group('Einladungen', () {
    GroupInvite invite({String? expires, int? maxUses, int useCount = 0, String? revoked}) => GroupInvite.fromJson({
      'id': 'i1',
      'group_id': 'g1',
      'created_by': 'u1',
      'created_at': _ts,
      'expires_at': expires,
      'max_uses': maxUses,
      'use_count': useCount,
      'revoked_at': revoked,
    });
    final now = DateTime.parse('2026-11-05T00:00:00Z');

    test('Status', () {
      expect(invite().statusAt(now), InviteStatus.active);
      expect(invite(expires: '2026-11-04T12:00:00Z').statusAt(now), InviteStatus.expired);
      expect(invite(maxUses: 1, useCount: 1).statusAt(now), InviteStatus.exhausted);
      expect(invite(revoked: _ts).statusAt(now), InviteStatus.revoked);
    });
    test('Hash-Spalte wird nie abgefragt', () {
      expect(GroupInvite.columns, isNot(contains('code_hash')));
    });
    test('CreatedInvite.fromJson', () {
      final c = CreatedInvite.fromJson({'invite_id': 'i1', 'code': 'ABCD-EFGH-JKMN', 'expires_at': _ts});
      expect(c.code, 'ABCD-EFGH-JKMN');
      expect(c.expiresAt, DateTime.parse(_ts));
    });
  });

  group('Revier', () {
    test('fromJson mit Gruppenname', () {
      final r = Revier.fromJson({
        'id': 'r1',
        'name': 'Nord',
        'description': null,
        'group_id': 'g1',
        'created_by': 'u1',
        'created_at': _ts,
        'updated_at': _ts,
        'group': {'name': 'Jagdfreunde'},
      });
      expect(r.description, '');
      expect(r.groupName, 'Jagdfreunde');
    });
  });

  test('WaypointCategory entspricht dem Datenbank-Enum', () {
    expect(WaypointCategory.values.map((c) => c.value), [
      'hochsitz',
      'kanzel',
      'kirrung',
      'fuetterung',
      'wildkamera',
      'weg',
      'gefahr',
      'sonstiges',
    ]);
    expect(WaypointCategory.fromValue('unbekannt'), WaypointCategory.sonstiges);
  });
}
