import 'package:drueckjagd_app/features/groups/domain/group_role.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  GroupPermissions p(GroupRole role, {bool adminsManage = true}) =>
      GroupPermissions(role: role, adminsCanManageMembers: adminsManage);

  test('Owner darf alles', () {
    final owner = p(GroupRole.owner);
    expect(owner.canEditGroup, isTrue);
    expect(owner.canDeleteGroup, isTrue);
    expect(owner.canInvite, isTrue);
    expect(owner.canAssignRoles, isTrue);
    expect(owner.canCreateRevier, isTrue);
    expect(owner.canDeleteRevier, isTrue);
    expect(owner.canRemove(GroupRole.admin, isSelf: false), isTrue);
    expect(owner.canRemove(GroupRole.owner, isSelf: true), isFalse);
  });

  test('Admin verwaltet Mitglieder nur mit Freigabe des Owners', () {
    final admin = p(GroupRole.admin);
    expect(admin.canEditGroup, isFalse);
    expect(admin.canAssignRoles, isFalse);
    expect(admin.canInvite, isTrue);
    expect(admin.canEditRevier, isTrue);
    expect(admin.canDeleteRevier, isFalse);
    expect(admin.canRemove(GroupRole.member, isSelf: false), isTrue);
    expect(admin.canRemove(GroupRole.admin, isSelf: false), isFalse);
    expect(admin.canRemove(GroupRole.owner, isSelf: false), isFalse);

    final restricted = p(GroupRole.admin, adminsManage: false);
    expect(restricted.canInvite, isFalse);
    expect(restricted.canRemove(GroupRole.member, isSelf: false), isFalse);
    expect(restricted.canEditRevier, isTrue);
  });

  test('Member darf nur lesen', () {
    final member = p(GroupRole.member);
    expect(member.canEditGroup, isFalse);
    expect(member.canInvite, isFalse);
    expect(member.canCreateRevier, isFalse);
    expect(member.canRemove(GroupRole.member, isSelf: false), isFalse);
  });
}
