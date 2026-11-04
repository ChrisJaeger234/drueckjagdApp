import '../../profile/domain/profile.dart';
import 'group_role.dart';

/// Jagdgruppe (Tabelle `groups`).
class HuntingGroup {
  const HuntingGroup({
    required this.id,
    required this.name,
    required this.description,
    required this.adminsCanManageMembers,
    required this.createdAt,
    required this.updatedAt,
    this.createdBy,
  });

  factory HuntingGroup.fromJson(Map<String, dynamic> json) => HuntingGroup(
    id: json['id'] as String,
    name: json['name'] as String,
    description: (json['description'] as String?) ?? '',
    createdBy: json['created_by'] as String?,
    adminsCanManageMembers: (json['admins_can_manage_members'] as bool?) ?? true,
    createdAt: DateTime.parse(json['created_at'] as String),
    updatedAt: DateTime.parse(json['updated_at'] as String),
  );

  static const columns = 'id, name, description, created_by, admins_can_manage_members, created_at, updated_at';

  final String id;
  final String name;
  final String description;
  final String? createdBy;
  final bool adminsCanManageMembers;
  final DateTime createdAt;
  final DateTime updatedAt;
}

/// Eine Gruppe aus Sicht des angemeldeten Benutzers (inkl. eigener Rolle).
class MyGroup {
  const MyGroup({required this.group, required this.role});

  factory MyGroup.fromMembershipJson(Map<String, dynamic> json) => MyGroup(
    group: HuntingGroup.fromJson(json['group'] as Map<String, dynamic>),
    role: GroupRole.fromValue(json['role'] as String),
  );

  final HuntingGroup group;
  final GroupRole role;

  GroupPermissions get permissions =>
      GroupPermissions(role: role, adminsCanManageMembers: group.adminsCanManageMembers);
}

/// Mitglied einer Gruppe mit Profil.
class GroupMember {
  const GroupMember({
    required this.id,
    required this.groupId,
    required this.userId,
    required this.role,
    required this.joinedAt,
    this.profile,
  });

  factory GroupMember.fromJson(Map<String, dynamic> json) => GroupMember(
    id: json['id'] as String,
    groupId: json['group_id'] as String,
    userId: json['user_id'] as String,
    role: GroupRole.fromValue(json['role'] as String),
    joinedAt: DateTime.parse(json['joined_at'] as String),
    profile: json['profile'] == null ? null : Profile.fromJson(json['profile'] as Map<String, dynamic>),
  );

  static const columns = 'id, group_id, user_id, role, joined_at, profile:profiles(${Profile.columns})';

  final String id;
  final String groupId;
  final String userId;
  final GroupRole role;
  final DateTime joinedAt;
  final Profile? profile;

  String get label => profile?.label ?? 'Unbekanntes Mitglied';
}
