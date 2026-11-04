import 'dart:async';

import 'package:drueckjagd_app/core/errors/app_exception.dart';
import 'package:drueckjagd_app/core/geo/geo_point.dart';
import 'package:drueckjagd_app/core/geo/geojson.dart';
import 'package:drueckjagd_app/core/services/location_service.dart';
import 'package:drueckjagd_app/features/map/domain/revier_boundary.dart';
import 'package:drueckjagd_app/features/map/domain/revier_map_repository.dart';
import 'package:drueckjagd_app/features/map/domain/waypoint.dart';

/// In-Memory-Kartendaten für Widget-Tests.
class FakeRevierMapRepository implements RevierMapRepository {
  FakeRevierMapRepository({required this.currentUserId});

  final String currentUserId;
  final List<RevierBoundary> boundaries = [];
  final List<Waypoint> waypoints = [];
  var _seq = 0;

  static final _ts = DateTime.utc(2026, 11, 4, 6);

  /// Testdaten anlegen.
  Waypoint seedWaypoint({required String revierId, required WaypointDraft draft, String? createdBy}) {
    final w = Waypoint(
      id: 'wp-${++_seq}',
      revierId: revierId,
      name: draft.name.trim(),
      description: draft.description.trim(),
      category: draft.category,
      location: draft.location,
      createdBy: createdBy ?? currentUserId,
    );
    waypoints.add(w);
    return w;
  }

  @override
  Future<List<RevierBoundary>> fetchBoundaries(String revierId) async =>
      boundaries.where((b) => b.revierId == revierId).toList();

  @override
  Future<RevierBoundary> replaceBoundary({required String revierId, required Map<String, dynamic> geojson}) async {
    if (GeoJson.polygons(geojson).isEmpty) {
      throw const AppException('Die Reviergrenze ist ungültig.', kind: AppErrorKind.validation);
    }
    boundaries.removeWhere((b) => b.revierId == revierId);
    final b = RevierBoundary(id: 'boundary-${++_seq}', revierId: revierId, geojson: geojson, updatedAt: _ts);
    boundaries.add(b);
    return b;
  }

  @override
  Future<void> deleteBoundaries(String revierId) async => boundaries.removeWhere((b) => b.revierId == revierId);

  @override
  Future<List<Waypoint>> fetchWaypoints(String revierId) async =>
      waypoints.where((w) => w.revierId == revierId).toList();

  @override
  Future<Waypoint> createWaypoint({required String revierId, required WaypointDraft draft}) async =>
      seedWaypoint(revierId: revierId, draft: draft);

  @override
  Future<Waypoint> updateWaypoint({required String waypointId, required WaypointDraft draft}) async {
    final i = waypoints.indexWhere((w) => w.id == waypointId);
    final old = waypoints[i];
    return waypoints[i] = Waypoint(
      id: old.id,
      revierId: old.revierId,
      name: draft.name.trim(),
      description: draft.description.trim(),
      category: draft.category,
      location: draft.location,
      createdBy: old.createdBy,
    );
  }

  @override
  Future<void> deleteWaypoint(String waypointId) async => waypoints.removeWhere((w) => w.id == waypointId);
}

/// Feste Position statt GPS.
class FakeLocationService implements LocationService {
  FakeLocationService([this.position = const DevicePosition(GeoPoint(51.1687, 7.2475), accuracy: 12)]);

  DevicePosition position;
  final _controller = StreamController<DevicePosition>.broadcast();

  @override
  Future<DevicePosition> current() async => position;

  @override
  Stream<DevicePosition> watch() => _controller.stream;
}
