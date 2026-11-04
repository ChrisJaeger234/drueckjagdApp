// Integrationstests der Repositories gegen einen echten (lokalen) Supabase-Stack.
//
// Voraussetzungen (siehe docs/SETUP.md, Abschnitt „Tests“):
//   supabase start && supabase db reset
//   flutter test test/integration \
//     --dart-define=SUPABASE_TEST_URL=http://127.0.0.1:54321 \
//     --dart-define=SUPABASE_TEST_KEY=<Publishable key aus `supabase status`>
//
// Ohne diese Werte werden die Tests mit einem klaren Hinweis übersprungen –
// sie täuschen keine erfolgreiche Backend-Verbindung vor.
@Tags(['integration'])
library;

import 'package:drueckjagd_app/core/errors/app_exception.dart';
import 'package:drueckjagd_app/features/authentication/data/supabase_auth_repository.dart';
import 'package:drueckjagd_app/features/authentication/domain/app_user.dart';
import 'package:drueckjagd_app/features/groups/data/supabase_groups_repository.dart';
import 'package:drueckjagd_app/features/groups/domain/group_invite.dart';
import 'package:drueckjagd_app/features/groups/domain/group_role.dart';
import 'package:drueckjagd_app/features/hunting_grounds/data/supabase_reviere_repository.dart';
import 'package:drueckjagd_app/features/profile/data/supabase_profile_repository.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

const _url = String.fromEnvironment('SUPABASE_TEST_URL');
const _key = String.fromEnvironment('SUPABASE_TEST_KEY');
const _skip = (_url == '' || _key == '')
    ? 'SUPABASE_TEST_URL/SUPABASE_TEST_KEY nicht gesetzt – Integrationstests benötigen einen laufenden Supabase-Stack.'
    : null;

/// Ein Testbenutzer mit eigenem Client und allen Repositories.
class _Actor {
  _Actor(this.name)
    : client = SupabaseClient(
        _url,
        _key,
        authOptions: const AuthClientOptions(autoRefreshToken: false, authFlowType: AuthFlowType.implicit),
      ) {
    auth = SupabaseAuthRepository(client, emailRedirectUrl: null);
    profiles = SupabaseProfileRepository(client);
    groups = SupabaseGroupsRepository(client);
    reviere = SupabaseReviereRepository(client);
  }

  final String name;
  final SupabaseClient client;
  late final SupabaseAuthRepository auth;
  late final SupabaseProfileRepository profiles;
  late final SupabaseGroupsRepository groups;
  late final SupabaseReviereRepository reviere;

  late final String email = '$name.${DateTime.now().microsecondsSinceEpoch}@test.local';
  static const password = 'Waidmann2026';

  String get id => auth.currentUser!.id;

  Future<void> register() async {
    final result = await auth.signUp(email: email, password: password);
    expect(result, SignUpResult.signedIn, reason: 'Lokal ist die E-Mail-Bestätigung deaktiviert');
  }
}

Matcher _appError(AppErrorKind kind) => throwsA(isA<AppException>().having((e) => e.kind, 'kind', kind));

void main() {
  late _Actor alice;
  late _Actor bob;
  late _Actor mallory;

  setUpAll(() async {
    if (_skip != null) return;
    alice = _Actor('alice');
    bob = _Actor('bob');
    mallory = _Actor('mallory');
    await alice.register();
    await bob.register();
    await mallory.register();
  });

  group('Authentifizierung', skip: _skip, () {
    test('schwaches Passwort wird serverseitig abgelehnt', () async {
      final a = _Actor('weak');
      await expectLater(a.auth.signUp(email: a.email, password: 'kurz'), _appError(AppErrorKind.weakPassword));
    });

    test('Abmelden und Anmelden; falsches Passwort wird abgelehnt', () async {
      final a = _Actor('relogin');
      await a.register();
      final id = a.id;
      await a.auth.signOut();
      expect(a.auth.currentUser, isNull);
      await expectLater(
        a.auth.signIn(email: a.email, password: 'Falsch2026'),
        _appError(AppErrorKind.invalidCredentials),
      );
      await a.auth.signIn(email: a.email, password: _Actor.password);
      expect(a.auth.currentUser?.id, id);
    });

    // Hinweis: Mit aktivierter E-Mail-Bestätigung (Produktion) meldet Supabase
    // doppelte Adressen aus Datenschutzgründen nicht; dieser Test prüft die
    // lokale Konfiguration ohne Bestätigung.
    test('doppelte Registrierung wird erkannt', () async {
      final again = _Actor('dupe');
      await expectLater(
        again.auth.signUp(email: alice.email, password: _Actor.password),
        _appError(AppErrorKind.emailAlreadyRegistered),
      );
    });
  });

  group('Profile', skip: _skip, () {
    test('Profil wird bei Registrierung angelegt und kann bearbeitet werden', () async {
      final p = await alice.profiles.fetchProfile(alice.id);
      expect(p.isComplete, isFalse);
      final username = 'alice_${DateTime.now().millisecondsSinceEpoch % 100000}';
      final updated = await alice.profiles.updateProfile(userId: alice.id, username: username, displayName: 'Alice');
      expect(updated.username, username);
      expect(updated.isComplete, isTrue);

      await expectLater(
        bob.profiles.updateProfile(userId: bob.id, username: username, displayName: 'Bob'),
        _appError(AppErrorKind.conflict),
      );
    });

    test('fremdes Profil kann nicht bearbeitet werden', () async {
      await expectLater(
        mallory.profiles.updateProfile(userId: alice.id, username: 'hacked_x', displayName: 'Hacked'),
        throwsA(isA<AppException>()),
      );
      final p = await alice.profiles.fetchProfile(alice.id);
      expect(p.displayName, isNot('Hacked'));
    });
  });

  group('Gruppen, Einladungen und Reviere', skip: _skip, () {
    late String groupId;
    late String code;

    test('Gruppe erstellen → Ersteller ist Owner', () async {
      final g = await alice.groups.createGroup(name: 'Jagdfreunde Test', description: 'Integration');
      groupId = g.id;
      final mine = await alice.groups.fetchMyGroups(alice.id);
      expect(mine.map((m) => (m.group.id, m.role)), contains((groupId, GroupRole.owner)));
    });

    test('Einladung erzeugen und einlösen', () async {
      final invite = await alice.groups.createInvite(groupId: groupId, validHours: 24, maxUses: 1);
      code = invite.code;
      expect(code, matches(RegExp(r'^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$')));

      final joined = await bob.groups.redeemInvite(code.toLowerCase());
      expect(joined, groupId);

      final members = await alice.groups.fetchMembers(groupId);
      expect(
        members.map((m) => (m.userId, m.role)),
        unorderedEquals([(alice.id, GroupRole.owner), (bob.id, GroupRole.member)]),
      );
      expect(members.firstWhere((m) => m.userId == alice.id).profile?.displayName, 'Alice');

      final invites = await alice.groups.fetchInvites(groupId);
      expect(invites.single.statusAt(DateTime.now()), InviteStatus.exhausted);
    });

    test('verbrauchter oder falscher Code wird abgelehnt', () async {
      await expectLater(mallory.groups.redeemInvite(code), _appError(AppErrorKind.validation));
      await expectLater(mallory.groups.redeemInvite('AAAA-BBBB-CCCC'), _appError(AppErrorKind.validation));
    });

    test('Außenstehende sehen nichts von der Gruppe', () async {
      expect(await mallory.groups.fetchMyGroups(mallory.id), isEmpty);
      await expectLater(
        mallory.groups.fetchMyGroup(userId: mallory.id, groupId: groupId),
        _appError(AppErrorKind.notFound),
      );
      expect(await mallory.groups.fetchMembers(groupId), isEmpty);
      expect(await mallory.groups.fetchInvites(groupId), isEmpty);
      await expectLater(mallory.groups.createInvite(groupId: groupId), _appError(AppErrorKind.forbidden));
    });

    test('Member darf weder einladen noch Gruppe bearbeiten noch Reviere anlegen', () async {
      await expectLater(bob.groups.createInvite(groupId: groupId), _appError(AppErrorKind.forbidden));
      await expectLater(
        bob.groups.updateGroup(groupId: groupId, name: 'Übernommen', description: '', adminsCanManageMembers: true),
        _appError(AppErrorKind.forbidden),
      );
      await expectLater(
        bob.reviere.create(groupId: groupId, createdBy: bob.id, name: 'Bobs Revier', description: ''),
        _appError(AppErrorKind.forbidden),
      );
    });

    test('Owner ernennt Admin → Admin legt Revier an und bearbeitet es', () async {
      await alice.groups.setMemberRole(groupId: groupId, userId: bob.id, role: GroupRole.admin);
      final revier = await bob.reviere.create(
        groupId: groupId,
        createdBy: bob.id,
        name: 'Revier Nord',
        description: 'Hochwald',
      );
      expect(revier.groupName, 'Jagdfreunde Test');
      final edited = await bob.reviere.update(revierId: revier.id, name: 'Revier Nord', description: 'Geändert');
      expect(edited.description, 'Geändert');

      await expectLater(
        alice.reviere.create(groupId: groupId, createdBy: alice.id, name: 'revier nord', description: ''),
        _appError(AppErrorKind.conflict),
        reason: 'Reviernamen sind je Gruppe eindeutig (ohne Groß-/Kleinschreibung)',
      );

      expect((await alice.reviere.fetchForGroup(groupId)).single.id, revier.id);
      expect(await mallory.reviere.fetchAll(), isEmpty);
      await expectLater(mallory.reviere.fetchById(revier.id), _appError(AppErrorKind.notFound));
      await expectLater(
        bob.reviere.delete(revier.id),
        _appError(AppErrorKind.forbidden),
        reason: 'Nur Owner löschen Reviere',
      );
    });

    test('Mitglieder verlassen; letzter Owner kann nicht gehen; Owner löscht Gruppe', () async {
      await expectLater(alice.groups.leaveGroup(groupId), _appError(AppErrorKind.conflict));
      await expectLater(bob.groups.removeMember(groupId: groupId, userId: alice.id), _appError(AppErrorKind.forbidden));

      await bob.groups.leaveGroup(groupId);
      expect(await bob.groups.fetchMyGroups(bob.id), isEmpty);
      expect(await bob.reviere.fetchAll(), isEmpty, reason: 'Nach dem Verlassen keine Reviere mehr sichtbar');

      await alice.groups.deleteGroup(groupId);
      expect(await alice.groups.fetchMyGroups(alice.id), isEmpty);
    });
  });
}
