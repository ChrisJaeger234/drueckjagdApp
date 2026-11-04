import 'geo_point.dart';

/// Stand einer Jagd (Tabelle `hunt_stands`).
class HuntStand {
  const HuntStand({
    required this.id,
    required this.huntId,
    required this.label,
    required this.location,
    this.waypointId,
    this.zoneId,
    this.description = '',
    this.sortOrder = 0,
  });

  factory HuntStand.fromJson(Map<String, dynamic> json) => HuntStand(
    id: json['id'] as String,
    huntId: json['hunt_id'] as String,
    label: json['label'] as String,
    location: GeoPoint.maybeFromJson(json)!,
    waypointId: json['waypoint_id'] as String?,
    zoneId: json['zone_id'] as String?,
    description: (json['description'] as String?) ?? '',
    sortOrder: (json['sort_order'] as num?)?.toInt() ?? 0,
  );

  static const columns = 'id, hunt_id, label, waypoint_id, zone_id, latitude, longitude, description, sort_order';

  final String id;
  final String huntId;
  final String label;
  final GeoPoint location;

  /// Verknüpfte jagdliche Einrichtung (z. B. Drückjagdbock).
  final String? waypointId;
  final String? zoneId;

  /// Hinweise, z. B. Schussrichtung, Zustieg.
  final String description;
  final int sortOrder;
}
