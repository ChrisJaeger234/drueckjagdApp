import 'hunt_enums.dart';

/// Teilnahme an einer Jagd (Tabelle `hunt_participants`).
class HuntParticipant {
  const HuntParticipant({
    required this.id,
    required this.huntId,
    required this.userId,
    required this.role,
    this.standId,
    this.zoneId,
    this.note = '',
    this.displayName,
    this.username,
  });

  factory HuntParticipant.fromJson(Map<String, dynamic> json) {
    final profile = json['profile'] as Map<String, dynamic>?;
    return HuntParticipant(
      id: json['id'] as String,
      huntId: json['hunt_id'] as String,
      userId: json['user_id'] as String,
      role: HuntRole.fromValue(json['role'] as String),
      standId: json['stand_id'] as String?,
      zoneId: json['zone_id'] as String?,
      note: (json['note'] as String?) ?? '',
      displayName: profile?['display_name'] as String?,
      username: profile?['username'] as String?,
    );
  }

  static const columns =
      'id, hunt_id, user_id, role, stand_id, zone_id, note, profile:profiles(display_name, username)';

  final String id;
  final String huntId;
  final String userId;
  final HuntRole role;
  final String? standId;
  final String? zoneId;
  final String note;
  final String? displayName;
  final String? username;

  /// Anzeigename mit Rückfall auf den Benutzernamen.
  String get name {
    if (displayName != null && displayName!.trim().isNotEmpty) return displayName!.trim();
    if (username != null && username!.isNotEmpty) return '@$username';
    return 'Unbekannt';
  }
}
