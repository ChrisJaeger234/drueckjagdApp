import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/errors/app_exception.dart';
import '../../../core/errors/error_mapper.dart';
import '../domain/group_invite.dart';
import '../domain/group_role.dart';
import '../domain/groups_repository.dart';
import '../domain/hunting_group.dart';

class SupabaseGroupsRepository implements GroupsRepository {
  SupabaseGroupsRepository(this._client);

  final SupabaseClient _client;

  static const _membershipColumns = 'role, group:groups!inner(${HuntingGroup.columns})';

  @override
  Future<List<MyGroup>> fetchMyGroups(String userId) => guard(() async {
    final rows = await _client.from('group_members').select(_membershipColumns).eq('user_id', userId);
    final groups = rows.map(MyGroup.fromMembershipJson).toList()
      ..sort((a, b) => a.group.name.toLowerCase().compareTo(b.group.name.toLowerCase()));
    return groups;
  });

  @override
  Future<MyGroup> fetchMyGroup({required String userId, required String groupId}) => guard(() async {
    final row = await _client
        .from('group_members')
        .select(_membershipColumns)
        .eq('user_id', userId)
        .eq('group_id', groupId)
        .maybeSingle();
    if (row == null) {
      throw const AppException('Diese Gruppe existiert nicht oder du bist kein Mitglied.', kind: AppErrorKind.notFound);
    }
    return MyGroup.fromMembershipJson(row);
  });

  @override
  Future<HuntingGroup> createGroup({required String name, required String description}) => guard(() async {
    final row = await _client.rpc<Map<String, dynamic>>(
      'create_group',
      params: {'p_name': name.trim(), 'p_description': description.trim()},
    );
    return HuntingGroup.fromJson(row);
  });

  @override
  Future<void> updateGroup({
    required String groupId,
    required String name,
    required String description,
    required bool adminsCanManageMembers,
  }) => guard(() async {
    final rows = await _client
        .from('groups')
        .update({
          'name': name.trim(),
          'description': description.trim(),
          'admins_can_manage_members': adminsCanManageMembers,
        })
        .eq('id', groupId)
        .select('id');
    _ensureAffected(rows);
  });

  @override
  Future<void> deleteGroup(String groupId) => guard(() async {
    final rows = await _client.from('groups').delete().eq('id', groupId).select('id');
    _ensureAffected(rows);
  });

  @override
  Future<List<GroupMember>> fetchMembers(String groupId) => guard(() async {
    final rows = await _client.from('group_members').select(GroupMember.columns).eq('group_id', groupId);
    final members = rows.map(GroupMember.fromJson).toList()
      ..sort((a, b) {
        final byRole = a.role.index.compareTo(b.role.index);
        return byRole != 0 ? byRole : a.label.toLowerCase().compareTo(b.label.toLowerCase());
      });
    return members;
  });

  @override
  Future<void> setMemberRole({required String groupId, required String userId, required GroupRole role}) => guard(
    () => _client.rpc<void>(
      'set_group_member_role',
      params: {'p_group_id': groupId, 'p_user_id': userId, 'p_role': role.value},
    ),
  );

  @override
  Future<void> removeMember({required String groupId, required String userId}) =>
      guard(() => _client.rpc<void>('remove_group_member', params: {'p_group_id': groupId, 'p_user_id': userId}));

  @override
  Future<void> leaveGroup(String groupId) =>
      guard(() => _client.rpc<void>('leave_group', params: {'p_group_id': groupId}));

  @override
  Future<CreatedInvite> createInvite({required String groupId, int? validHours, int? maxUses}) => guard(() async {
    final rows = await _client.rpc<List<dynamic>>(
      'create_group_invite',
      params: {'p_group_id': groupId, 'p_valid_hours': validHours, 'p_max_uses': maxUses},
    );
    return CreatedInvite.fromJson(rows.first as Map<String, dynamic>);
  });

  @override
  Future<List<GroupInvite>> fetchInvites(String groupId) => guard(() async {
    final rows = await _client
        .from('group_invites')
        .select(GroupInvite.columns)
        .eq('group_id', groupId)
        .order('created_at', ascending: false);
    return rows.map(GroupInvite.fromJson).toList();
  });

  @override
  Future<void> revokeInvite(String inviteId) =>
      guard(() => _client.rpc<void>('revoke_group_invite', params: {'p_invite_id': inviteId}));

  @override
  Future<String> redeemInvite(String code) => guard(() async {
    final groupId = await _client.rpc<String?>('redeem_group_invite', params: {'p_code': code});
    if (groupId == null) {
      throw const AppException(
        'Dieser Einladungscode ist ungültig, abgelaufen oder wurde bereits verwendet.',
        kind: AppErrorKind.validation,
      );
    }
    return groupId;
  });

  /// RLS filtert unberechtigte Zeilen still heraus – wir melden das explizit.
  static void _ensureAffected(List<dynamic> rows) {
    if (rows.isEmpty) {
      throw const AppException('Dafür fehlen dir die Berechtigungen.', kind: AppErrorKind.forbidden);
    }
  }
}
