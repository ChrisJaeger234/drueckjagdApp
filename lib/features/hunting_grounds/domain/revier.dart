/// Revier (Tabelle `reviere`).
class Revier {
  const Revier({
    required this.id,
    required this.name,
    required this.description,
    required this.groupId,
    required this.createdAt,
    required this.updatedAt,
    this.createdBy,
    this.groupName,
  });

  factory Revier.fromJson(Map<String, dynamic> json) => Revier(
    id: json['id'] as String,
    name: json['name'] as String,
    description: (json['description'] as String?) ?? '',
    groupId: json['group_id'] as String,
    createdBy: json['created_by'] as String?,
    createdAt: DateTime.parse(json['created_at'] as String),
    updatedAt: DateTime.parse(json['updated_at'] as String),
    groupName: (json['group'] as Map<String, dynamic>?)?['name'] as String?,
  );

  static const columns = 'id, name, description, group_id, created_by, created_at, updated_at, group:groups(name)';

  final String id;
  final String name;
  final String description;
  final String groupId;
  final String? createdBy;
  final DateTime createdAt;
  final DateTime updatedAt;

  /// Name der zugehörigen Gruppe (falls mitgeladen).
  final String? groupName;
}
