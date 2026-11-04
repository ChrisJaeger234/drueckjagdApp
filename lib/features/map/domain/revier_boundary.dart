import '../../../core/geo/geojson.dart';

/// Grenze eines Reviers (Tabelle `revier_boundaries`).
///
/// Die Datenbank normalisiert `boundary_data` zu einem GeoJSON-MultiPolygon
/// (Trigger aus Migration 0009).
class RevierBoundary {
  RevierBoundary({required this.id, required this.revierId, required this.geojson, required this.updatedAt})
    : polygons = GeoJson.polygons(geojson);

  factory RevierBoundary.fromJson(Map<String, dynamic> json) => RevierBoundary(
    id: json['id'] as String,
    revierId: json['revier_id'] as String,
    geojson: Map<String, dynamic>.from(json['boundary_data'] as Map),
    updatedAt: DateTime.parse(json['updated_at'] as String),
  );

  static const columns = 'id, revier_id, boundary_data, updated_at';

  final String id;
  final String revierId;
  final Map<String, dynamic> geojson;
  final DateTime updatedAt;
  final List<GeoPolygon> polygons;

  double get areaHectares => GeoJson.areaHectares(polygons);
}
