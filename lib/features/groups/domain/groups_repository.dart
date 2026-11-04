import 'group_invite.dart';
import 'group_role.dart';
import 'hunting_group.dart';

abstract interface class GroupsRepository {
  Future<List<MyGroup>> fetchMyGroups(String userId);

  Future<MyGroup> fetchMyGroup({required String userId, required String groupId});

  Future<HuntingGroup> createGroup({required String name, required String description});

  Future<void> updateGroup({
    required String groupId,
    required String name,
    required String description,
    required bool adminsCanManageMembers,
  });

  Future<void> deleteGroup(String groupId);

  Future<List<GroupMember>> fetchMembers(String groupId);

  Future<void> setMemberRole({required String groupId, required String userId, required GroupRole role});

  Future<void> removeMember({required String groupId, required String userId});

  Future<void> leaveGroup(String groupId);

  Future<CreatedInvite> createInvite({required String groupId, int? validHours, int? maxUses});

  Future<List<GroupInvite>> fetchInvites(String groupId);

  Future<void> revokeInvite(String inviteId);

  /// Löst einen Code ein und liefert die Gruppen-ID.
  /// Wirft [AppException] mit [AppErrorKind.validation], wenn der Code
  /// ungültig, abgelaufen, widerrufen oder aufgebraucht ist.
  Future<String> redeemInvite(String code);
}
