import '../../../core/geo/geo_point.dart';
import 'hunt_enums.dart';

/// Eine Jagd (Tabelle `hunts`).
class Hunt {
  const Hunt({
    required this.id,
    required this.groupId,
    required this.title,
    required this.startsAt,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.revierId,
    this.description = '',
    this.endsAt,
    this.meetingPoint = '',
    this.meetingLocation,
    this.gameRelease = '',
    this.safetyNotes = '',
    this.emergencyInfo = '',
    this.selfJoin = true,
    this.createdBy,
    this.groupName,
    this.revierName,
  });

  factory Hunt.fromJson(Map<String, dynamic> json) => Hunt(
    id: json['id'] as String,
    groupId: json['group_id'] as String,
    revierId: json['revier_id'] as String?,
    title: json['title'] as String,
    description: (json['description'] as String?) ?? '',
    startsAt: DateTime.parse(json['starts_at'] as String),
    endsAt: json['ends_at'] == null ? null : DateTime.parse(json['ends_at'] as String),
    status: HuntStatus.fromValue(json['status'] as String),
    meetingPoint: (json['meeting_point'] as String?) ?? '',
    meetingLocation: GeoPoint.maybeFromJson(json, lat: 'meeting_latitude', lng: 'meeting_longitude'),
    gameRelease: (json['game_release'] as String?) ?? '',
    safetyNotes: (json['safety_notes'] as String?) ?? '',
    emergencyInfo: (json['emergency_info'] as String?) ?? '',
    selfJoin: (json['self_join'] as bool?) ?? true,
    createdBy: json['created_by'] as String?,
    createdAt: DateTime.parse(json['created_at'] as String),
    updatedAt: DateTime.parse(json['updated_at'] as String),
    groupName: (json['group'] as Map<String, dynamic>?)?['name'] as String?,
    revierName: (json['revier'] as Map<String, dynamic>?)?['name'] as String?,
  );

  static const columns =
      'id, group_id, revier_id, title, description, starts_at, ends_at, status, meeting_point, '
      'meeting_latitude, meeting_longitude, game_release, safety_notes, emergency_info, self_join, '
      'created_by, created_at, updated_at, group:groups(name), revier:reviere(name)';

  final String id;
  final String groupId;
  final String? revierId;
  final String title;
  final String description;
  final DateTime startsAt;
  final DateTime? endsAt;
  final HuntStatus status;
  final String meetingPoint;
  final GeoPoint? meetingLocation;

  /// Freigabe: welches Wild erlegt werden darf.
  final String gameRelease;
  final String safetyNotes;
  final String emergencyInfo;

  /// Dürfen sich Gruppenmitglieder selbst eintragen?
  final bool selfJoin;
  final String? createdBy;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String? groupName;
  final String? revierName;

  bool get canSelfJoin => selfJoin && status.isOpen;
}

/// Eingabedaten zum Anlegen/Bearbeiten einer Jagd.
class HuntDraft {
  const HuntDraft({
    required this.title,
    required this.startsAt,
    this.revierId,
    this.description = '',
    this.endsAt,
    this.status = HuntStatus.geplant,
    this.meetingPoint = '',
    this.meetingLocation,
    this.gameRelease = '',
    this.safetyNotes = '',
    this.emergencyInfo = '',
    this.selfJoin = true,
  });

  final String title;
  final DateTime startsAt;
  final String? revierId;
  final String description;
  final DateTime? endsAt;
  final HuntStatus status;
  final String meetingPoint;
  final GeoPoint? meetingLocation;
  final String gameRelease;
  final String safetyNotes;
  final String emergencyInfo;
  final bool selfJoin;

  Map<String, dynamic> toJson() => {
    'title': title.trim(),
    'revier_id': revierId,
    'description': description.trim(),
    'starts_at': startsAt.toUtc().toIso8601String(),
    'ends_at': endsAt?.toUtc().toIso8601String(),
    'status': status.value,
    'meeting_point': meetingPoint.trim(),
    'meeting_latitude': meetingLocation?.latitude,
    'meeting_longitude': meetingLocation?.longitude,
    'game_release': gameRelease.trim(),
    'safety_notes': safetyNotes.trim(),
    'emergency_info': emergencyInfo.trim(),
    'self_join': selfJoin,
  };
}
