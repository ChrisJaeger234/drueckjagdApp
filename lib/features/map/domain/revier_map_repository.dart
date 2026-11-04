import 'revier_boundary.dart';
import 'waypoint.dart';

/// Kartendaten eines Reviers: Grenze und Einrichtungen.
/// Berechtigungen prüft der Server (RLS).
abstract interface class RevierMapRepository {
  /// Alle gespeicherten Grenzflächen des Reviers (meist genau eine).
  Future<List<RevierBoundary>> fetchBoundaries(String revierId);

  /// Ersetzt die Grenze des Reviers durch [geojson]
  /// (Polygon, MultiPolygon, Feature oder FeatureCollection).
  Future<RevierBoundary> replaceBoundary({required String revierId, required Map<String, dynamic> geojson});

  /// Entfernt alle Grenzflächen des Reviers.
  Future<void> deleteBoundaries(String revierId);

  Future<List<Waypoint>> fetchWaypoints(String revierId);

  Future<Waypoint> createWaypoint({required String revierId, required WaypointDraft draft});

  Future<Waypoint> updateWaypoint({required String waypointId, required WaypointDraft draft});

  Future<void> deleteWaypoint(String waypointId);
}
