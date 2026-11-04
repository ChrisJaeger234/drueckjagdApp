import '../../../core/geo/geo_point.dart';
import 'waypoint_category.dart';

/// Jagdliche Einrichtung bzw. Wegpunkt eines Reviers (Tabelle `waypoints`).
class Waypoint {
  const Waypoint({
    required this.id,
    required this.revierId,
    required this.name,
    required this.category,
    required this.location,
    this.description = '',
    this.createdBy,
  });

  factory Waypoint.fromJson(Map<String, dynamic> json) => Waypoint(
    id: json['id'] as String,
    revierId: json['revier_id'] as String,
    name: json['name'] as String,
    description: (json['description'] as String?) ?? '',
    category: WaypointCategory.fromValue(json['category'] as String),
    location: GeoPoint.maybeFromJson(json)!,
    createdBy: json['created_by'] as String?,
  );

  /// `geom` wird nicht geladen; die App arbeitet mit latitude/longitude.
  static const columns = 'id, revier_id, created_by, name, description, category, latitude, longitude';

  final String id;
  final String revierId;
  final String name;
  final String description;
  final WaypointCategory category;
  final GeoPoint location;
  final String? createdBy;
}

/// Eingaben für eine neue oder geänderte Einrichtung.
class WaypointDraft {
  const WaypointDraft({required this.name, required this.category, required this.location, this.description = ''});

  final String name;
  final WaypointCategory category;
  final GeoPoint location;
  final String description;

  Map<String, dynamic> toJson() => {
    'name': name.trim(),
    'description': description.trim(),
    'category': category.value,
    'latitude': location.latitude,
    'longitude': location.longitude,
  };
}
