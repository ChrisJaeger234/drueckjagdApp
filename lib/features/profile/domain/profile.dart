/// Benutzerprofil (Tabelle `profiles`).
class Profile {
  const Profile({
    required this.id,
    required this.displayName,
    required this.createdAt,
    required this.updatedAt,
    this.username,
    this.avatarUrl,
  });

  factory Profile.fromJson(Map<String, dynamic> json) => Profile(
        id: json['id'] as String,
        username: json['username'] as String?,
        displayName: (json['display_name'] as String?) ?? '',
        avatarUrl: json['avatar_url'] as String?,
        createdAt: DateTime.parse(json['created_at'] as String),
        updatedAt: DateTime.parse(json['updated_at'] as String),
      );

  /// Spalten, die beim Laden abgefragt werden.
  static const columns = 'id, username, display_name, avatar_url, created_at, updated_at';

  final String id;
  final String? username;
  final String displayName;

  /// Pfad im privaten Storage-Bucket `avatars` (Upload folgt in Phase 2).
  final String? avatarUrl;
  final DateTime createdAt;
  final DateTime updatedAt;

  /// Name für die Anzeige in Listen.
  String get label {
    if (displayName.trim().isNotEmpty) return displayName.trim();
    if (username != null && username!.isNotEmpty) return '@$username';
    return 'Unbenannt';
  }

  /// Ein Profil ist vollständig, wenn Benutzer- und Anzeigename gesetzt sind.
  bool get isComplete => (username?.isNotEmpty ?? false) && displayName.trim().isNotEmpty;

  Map<String, dynamic> toUpdateJson() => {
        'username': username,
        'display_name': displayName,
        'avatar_url': avatarUrl,
      };

  Profile copyWith({String? username, String? displayName, String? avatarUrl}) => Profile(
        id: id,
        username: username ?? this.username,
        displayName: displayName ?? this.displayName,
        avatarUrl: avatarUrl ?? this.avatarUrl,
        createdAt: createdAt,
        updatedAt: updatedAt,
      );
}
