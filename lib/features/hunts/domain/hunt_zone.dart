import 'hunt_enums.dart';

/// Fläche einer Jagd (Tabelle `hunt_zones`), z. B. ein Treiben.
class HuntZone {
  const HuntZone({
    required this.id,
    required this.huntId,
    required this.name,
    required this.kind,
    required this.boundary,
    this.description = '',
    this.color,
  });

  factory HuntZone.fromJson(Map<String, dynamic> json) => HuntZone(
    id: json['id'] as String,
    huntId: json['hunt_id'] as String,
    name: json['name'] as String,
    kind: HuntZoneKind.fromValue(json['kind'] as String),
    description: (json['description'] as String?) ?? '',
    color: json['color'] as String?,
    boundary: Map<String, dynamic>.from(json['boundary_data'] as Map),
  );

  /// `geom` wird bewusst nicht geladen (Binärformat); die Karte nutzt GeoJSON.
  static const columns = 'id, hunt_id, name, kind, description, color, boundary_data';

  final String id;
  final String huntId;
  final String name;
  final HuntZoneKind kind;
  final String description;

  /// Farbe als `#RRGGBB` oder `null` für die Standardfarbe der Art.
  final String? color;

  /// Normalisiertes GeoJSON-MultiPolygon.
  final Map<String, dynamic> boundary;
}
