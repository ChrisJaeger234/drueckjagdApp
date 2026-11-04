import 'dart:async';

import 'package:drueckjagd_app/core/errors/app_exception.dart';
import 'package:drueckjagd_app/features/authentication/domain/app_user.dart';
import 'package:drueckjagd_app/features/authentication/domain/auth_repository.dart';
import 'package:drueckjagd_app/features/groups/domain/group_invite.dart';
import 'package:drueckjagd_app/features/groups/domain/group_role.dart';
import 'package:drueckjagd_app/features/groups/domain/groups_repository.dart';
import 'package:drueckjagd_app/features/groups/domain/hunting_group.dart';
import 'package:drueckjagd_app/features/hunting_grounds/domain/revier.dart';
import 'package:drueckjagd_app/features/hunting_grounds/domain/reviere_repository.dart';
import 'package:drueckjagd_app/features/profile/domain/profile.dart';
import 'package:drueckjagd_app/features/profile/domain/profile_repository.dart';

final _epoch = DateTime.utc(2026, 11, 4, 6);

/// In-Memory-Authentifizierung für Widget- und Controller-Tests.
class FakeAuthRepository implements AuthRepository {
  FakeAuthRepository({this.requireConfirmation = false, AppUser? signedIn}) : _user = signedIn;

  final bool requireConfirmation;
  final Map<String, String> passwords = {'jaeger@example.de': 'geheim123'};
  final _controller = StreamController<AppUser?>.broadcast();
  AppUser? _user;
  int signInCalls = 0;

  @override
  AppUser? get currentUser => _user;

  @override
  Stream<AppUser?> authStateChanges() => Stream.multi((listener) {
        listener.add(_user);
        final sub = _controller.stream.listen(listener.add);
        listener.onCancel = sub.cancel;
      });

  void _emit(AppUser? user) {
    _user = user;
    _controller.add(user);
  }

  @override
  Future<void> signIn({required String email, required String password}) async {
    signInCalls++;
    if (passwords[email.trim()] != password) {
      throw const AppException('E-Mail-Adresse oder Passwort ist falsch.', kind: AppErrorKind.invalidCredentials);
    }
    _emit(AppUser(id: 'user-1', email: email.trim()));
  }

  @override
  Future<SignUpResult> signUp({required String email, required String password}) async {
    if (passwords.containsKey(email.trim())) {
      throw const AppException('Für diese E-Mail-Adresse existiert bereits ein Konto.',
          kind: AppErrorKind.emailAlreadyRegistered);
    }
    passwords[email.trim()] = password;
    if (requireConfirmation) return SignUpResult.confirmationRequired;
    _emit(AppUser(id: 'user-new', email: email.trim()));
    return SignUpResult.signedIn;
  }

  @override
  Future<void> signOut() async => _emit(null);

  @override
  Future<void> resendConfirmationEmail(String email) async {}
}

class FakeProfileRepository implements ProfileRepository {
  final Map<String, Profile> profiles = {};

  Profile _ensure(String id) => profiles.putIfAbsent(
        id,
        () => Profile(id: id, displayName: '', createdAt: _epoch, updatedAt: _epoch),
      );

  @override
  Future<Profile> fetchProfile(String userId) async => _ensure(userId);

  @override
  Future<Profile> updateProfile({
    required String userId,
    required String username,
    required String displayName,
  }) async {
    final updated = _ensure(userId).copyWith(username: username, displayName: displayName);
    profiles[userId] = updated;
    return updated;
  }
}

/// Vereinfachte, aber regelkonforme In-Memory-Gruppenverwaltung.
class FakeGroupsRepository implements GroupsRepository {
  FakeGroupsRepository({required this.currentUserId});

  final String currentUserId;
  final Map<String, HuntingGroup> groups = {};
  final Map<String, Map<String, GroupRole>> roles = {};
  final Map<String, String> inviteCodes = {};
  var _seq = 0;

  @override
  Future<List<MyGroup>> fetchMyGroups(String userId) async => [
        for (final g in groups.values)
          if (roles[g.id]?[userId] != null) MyGroup(group: g, role: roles[g.id]![userId]!),
      ];

  @override
  Future<MyGroup> fetchMyGroup({required String userId, required String groupId}) async {
    final role = roles[groupId]?[userId];
    if (role == null) throw const AppException('nicht gefunden', kind: AppErrorKind.notFound);
    return MyGroup(group: groups[groupId]!, role: role);
  }

  @override
  Future<HuntingGroup> createGroup({required String name, required String description}) async {
    final id = 'group-${++_seq}';
    final g = HuntingGroup(
      id: id,
      name: name.trim(),
      description: description.trim(),
      createdBy: currentUserId,
      adminsCanManageMembers: true,
      createdAt: _epoch,
      updatedAt: _epoch,
    );
    groups[id] = g;
    roles[id] = {currentUserId: GroupRole.owner};
    return g;
  }

  @override
  Future<void> updateGroup({
    required String groupId,
    required String name,
    required String description,
    required bool adminsCanManageMembers,
  }) async {
    final old = groups[groupId]!;
    groups[groupId] = HuntingGroup(
      id: groupId,
      name: name,
      description: description,
      createdBy: old.createdBy,
      adminsCanManageMembers: adminsCanManageMembers,
      createdAt: old.createdAt,
      updatedAt: _epoch,
    );
  }

  @override
  Future<void> deleteGroup(String groupId) async {
    groups.remove(groupId);
    roles.remove(groupId);
  }

  @override
  Future<List<GroupMember>> fetchMembers(String groupId) async => [
        for (final e in roles[groupId]!.entries)
          GroupMember(id: 'm-${e.key}', groupId: groupId, userId: e.key, role: e.value, joinedAt: _epoch),
      ];

  @override
  Future<void> setMemberRole({required String groupId, required String userId, required GroupRole role}) async =>
      roles[groupId]![userId] = role;

  @override
  Future<void> removeMember({required String groupId, required String userId}) async =>
      roles[groupId]!.remove(userId);

  @override
  Future<void> leaveGroup(String groupId) async => roles[groupId]!.remove(currentUserId);

  @override
  Future<CreatedInvite> createInvite({required String groupId, int? validHours, int? maxUses}) async {
    final code = 'ABCD-EFGH-JK${_seq++}0';
    inviteCodes[code] = groupId;
    return CreatedInvite(inviteId: 'inv-$_seq', code: code);
  }

  @override
  Future<List<GroupInvite>> fetchInvites(String groupId) async => const [];

  @override
  Future<void> revokeInvite(String inviteId) async {}

  @override
  Future<String> redeemInvite(String code) async {
    final groupId = inviteCodes[code];
    if (groupId == null) {
      throw const AppException('Dieser Einladungscode ist ungültig.', kind: AppErrorKind.validation);
    }
    roles[groupId]![currentUserId] = GroupRole.member;
    return groupId;
  }
}

class FakeReviereRepository implements ReviereRepository {
  final List<Revier> reviere = [];

  @override
  Future<List<Revier>> fetchAll() async => List.of(reviere);

  @override
  Future<List<Revier>> fetchForGroup(String groupId) async => reviere.where((r) => r.groupId == groupId).toList();

  @override
  Future<Revier> fetchById(String revierId) async => reviere.firstWhere((r) => r.id == revierId);

  @override
  Future<Revier> create({
    required String groupId,
    required String createdBy,
    required String name,
    required String description,
  }) async {
    final r = Revier(
      id: 'revier-${reviere.length + 1}',
      name: name,
      description: description,
      groupId: groupId,
      createdBy: createdBy,
      createdAt: _epoch,
      updatedAt: _epoch,
    );
    reviere.add(r);
    return r;
  }

  @override
  Future<Revier> update({required String revierId, required String name, required String description}) async {
    final i = reviere.indexWhere((r) => r.id == revierId);
    final old = reviere[i];
    return reviere[i] = Revier(
      id: old.id,
      name: name,
      description: description,
      groupId: old.groupId,
      createdBy: old.createdBy,
      createdAt: old.createdAt,
      updatedAt: _epoch,
    );
  }

  @override
  Future<void> delete(String revierId) async => reviere.removeWhere((r) => r.id == revierId);
}
