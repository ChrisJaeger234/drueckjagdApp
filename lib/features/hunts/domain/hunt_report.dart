import '../../../core/geo/geo_point.dart';
import 'hunt_enums.dart';

/// Meldung während einer Jagd (Tabelle `hunt_reports`).
class HuntReport {
  const HuntReport({
    required this.id,
    required this.huntId,
    required this.kind,
    required this.occurredAt,
    this.reporterId,
    this.reporterName,
    this.species = '',
    this.count = 1,
    this.standId,
    this.location,
    this.note = '',
    this.resolvedAt,
    this.resolvedBy,
  });

  factory HuntReport.fromJson(Map<String, dynamic> json) {
    final reporter = json['reporter'] as Map<String, dynamic>?;
    return HuntReport(
      id: json['id'] as String,
      huntId: json['hunt_id'] as String,
      reporterId: json['reporter_id'] as String?,
      reporterName: reporter?['display_name'] as String?,
      kind: HuntReportKind.fromValue(json['kind'] as String),
      species: (json['species'] as String?) ?? '',
      count: (json['count'] as num?)?.toInt() ?? 1,
      standId: json['stand_id'] as String?,
      location: GeoPoint.maybeFromJson(json),
      note: (json['note'] as String?) ?? '',
      occurredAt: DateTime.parse(json['occurred_at'] as String),
      resolvedAt: json['resolved_at'] == null ? null : DateTime.parse(json['resolved_at'] as String),
      resolvedBy: json['resolved_by'] as String?,
    );
  }

  static const columns =
      'id, hunt_id, reporter_id, kind, species, count, stand_id, latitude, longitude, note, '
      'occurred_at, resolved_at, resolved_by, reporter:profiles!hunt_reports_reporter_id_fkey(display_name)';

  final String id;
  final String huntId;
  final String? reporterId;
  final String? reporterName;
  final HuntReportKind kind;

  /// Wildart (frei, z. B. „Schwarzwild“).
  final String species;
  final int count;
  final String? standId;
  final GeoPoint? location;
  final String note;
  final DateTime occurredAt;
  final DateTime? resolvedAt;
  final String? resolvedBy;

  bool get isResolved => resolvedAt != null;

  /// Offene Nachsuche: angeschossen und noch nicht erledigt.
  bool get isOpenFollowUp => kind == HuntReportKind.angeschossen && !isResolved;
}

/// Eingabedaten für eine neue Meldung.
class HuntReportDraft {
  const HuntReportDraft({
    required this.huntId,
    required this.kind,
    this.species = '',
    this.count = 1,
    this.standId,
    this.location,
    this.note = '',
    this.occurredAt,
  });

  final String huntId;
  final HuntReportKind kind;
  final String species;
  final int count;
  final String? standId;
  final GeoPoint? location;
  final String note;
  final DateTime? occurredAt;

  Map<String, dynamic> toJson() => {
    'hunt_id': huntId,
    'kind': kind.value,
    'species': species.trim(),
    'count': count,
    'stand_id': standId,
    'latitude': location?.latitude,
    'longitude': location?.longitude,
    'note': note.trim(),
    if (occurredAt != null) 'occurred_at': occurredAt!.toUtc().toIso8601String(),
  };
}
