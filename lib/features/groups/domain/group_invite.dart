/// Einladung (Tabelle `group_invites`, ohne Hash).
class GroupInvite {
  const GroupInvite({
    required this.id,
    required this.groupId,
    required this.createdAt,
    required this.useCount,
    this.createdBy,
    this.expiresAt,
    this.maxUses,
    this.revokedAt,
  });

  factory GroupInvite.fromJson(Map<String, dynamic> json) => GroupInvite(
        id: json['id'] as String,
        groupId: json['group_id'] as String,
        createdBy: json['created_by'] as String?,
        createdAt: DateTime.parse(json['created_at'] as String),
        expiresAt: json['expires_at'] == null ? null : DateTime.parse(json['expires_at'] as String),
        maxUses: json['max_uses'] as int?,
        useCount: (json['use_count'] as int?) ?? 0,
        revokedAt: json['revoked_at'] == null ? null : DateTime.parse(json['revoked_at'] as String),
      );

  /// Der Code-Hash ist für Clients nicht lesbar und wird nie abgefragt.
  static const columns = 'id, group_id, created_by, created_at, expires_at, max_uses, use_count, revoked_at';

  final String id;
  final String groupId;
  final String? createdBy;
  final DateTime createdAt;
  final DateTime? expiresAt;
  final int? maxUses;
  final int useCount;
  final DateTime? revokedAt;

  InviteStatus statusAt(DateTime now) {
    if (revokedAt != null) return InviteStatus.revoked;
    if (expiresAt != null && !expiresAt!.isAfter(now)) return InviteStatus.expired;
    if (maxUses != null && useCount >= maxUses!) return InviteStatus.exhausted;
    return InviteStatus.active;
  }
}

enum InviteStatus {
  active('Aktiv'),
  expired('Abgelaufen'),
  exhausted('Aufgebraucht'),
  revoked('Widerrufen');

  const InviteStatus(this.label);

  final String label;
}

/// Frisch erzeugte Einladung – der Klartext-Code ist nur jetzt verfügbar.
class CreatedInvite {
  const CreatedInvite({required this.inviteId, required this.code, this.expiresAt});

  factory CreatedInvite.fromJson(Map<String, dynamic> json) => CreatedInvite(
        inviteId: json['invite_id'] as String,
        code: json['code'] as String,
        expiresAt: json['expires_at'] == null ? null : DateTime.parse(json['expires_at'] as String),
      );

  final String inviteId;
  final String code;
  final DateTime? expiresAt;
}
