/// Rolle innerhalb einer Jagdgruppe (entspricht `public.group_role`).
enum GroupRole {
  owner('owner', 'Owner', 'Verwaltet Gruppe, Mitglieder, Rollen und Reviere'),
  admin('admin', 'Admin', 'Bearbeitet Reviere und verwaltet Mitglieder, sofern erlaubt'),
  member('member', 'Mitglied', 'Sieht Gruppe, Reviere und Wegpunkte');

  const GroupRole(this.value, this.label, this.description);

  final String value;
  final String label;
  final String description;

  static GroupRole fromValue(String value) => GroupRole.values.firstWhere(
    (r) => r.value == value,
    orElse: () => throw FormatException('Unbekannte Rolle: $value'),
  );
}

/// Berechtigungen eines Mitglieds – spiegelt die serverseitigen Regeln
/// (RLS/Funktionen) für die Darstellung in der UI wider. Die eigentliche
/// Durchsetzung erfolgt immer serverseitig.
class GroupPermissions {
  const GroupPermissions({required this.role, required this.adminsCanManageMembers});

  final GroupRole role;
  final bool adminsCanManageMembers;

  bool get isOwner => role == GroupRole.owner;

  bool get canEditGroup => isOwner;

  bool get canDeleteGroup => isOwner;

  bool get canManageMembers => isOwner || (role == GroupRole.admin && adminsCanManageMembers);

  bool get canInvite => canManageMembers;

  bool get canAssignRoles => isOwner;

  bool get canCreateRevier => role == GroupRole.owner || role == GroupRole.admin;

  bool get canEditRevier => canCreateRevier;

  bool get canDeleteRevier => isOwner;

  /// Darf [target] aus der Gruppe entfernt werden?
  bool canRemove(GroupRole target, {required bool isSelf}) {
    if (isSelf) return false;
    if (isOwner) return true;
    return canManageMembers && target == GroupRole.member;
  }
}
