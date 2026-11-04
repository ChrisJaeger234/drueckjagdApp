import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/errors/app_exception.dart';
import '../../../core/errors/error_mapper.dart';
import '../domain/revier_boundary.dart';
import '../domain/revier_map_repository.dart';
import '../domain/waypoint.dart';

class SupabaseRevierMapRepository implements RevierMapRepository {
  SupabaseRevierMapRepository(this._client);

  final SupabaseClient _client;

  static const _forbidden = AppException('Dafür fehlen dir die Berechtigungen.', kind: AppErrorKind.forbidden);

  @override
  Future<List<RevierBoundary>> fetchBoundaries(String revierId) => guard(() async {
    final rows = await _client
        .from('revier_boundaries')
        .select(RevierBoundary.columns)
        .eq('revier_id', revierId)
        .order('created_at');
    return rows.map(RevierBoundary.fromJson).toList();
  });

  @override
  Future<RevierBoundary> replaceBoundary({required String revierId, required Map<String, dynamic> geojson}) =>
      guard(() async {
        final existing = await _client.from('revier_boundaries').select('id').eq('revier_id', revierId);
        Map<String, dynamic>? row;
        if (existing.isEmpty) {
          row = await _client
              .from('revier_boundaries')
              .insert({'revier_id': revierId, 'boundary_data': geojson})
              .select(RevierBoundary.columns)
              .single();
        } else {
          final keep = existing.first['id'] as String;
          row = await _client
              .from('revier_boundaries')
              .update({'boundary_data': geojson})
              .eq('id', keep)
              .select(RevierBoundary.columns)
              .maybeSingle();
          if (row == null) throw _forbidden;
          if (existing.length > 1) {
            await _client.from('revier_boundaries').delete().eq('revier_id', revierId).neq('id', keep);
          }
        }
        return RevierBoundary.fromJson(row);
      });

  @override
  Future<void> deleteBoundaries(String revierId) => guard(() async {
    final rows = await _client.from('revier_boundaries').delete().eq('revier_id', revierId).select('id');
    if (rows.isEmpty) throw _forbidden;
  });

  @override
  Future<List<Waypoint>> fetchWaypoints(String revierId) => guard(() async {
    final rows = await _client.from('waypoints').select(Waypoint.columns).eq('revier_id', revierId).order('name');
    return rows.map(Waypoint.fromJson).toList();
  });

  @override
  Future<Waypoint> createWaypoint({required String revierId, required WaypointDraft draft}) => guard(() async {
    final row = await _client
        .from('waypoints')
        .insert({...draft.toJson(), 'revier_id': revierId})
        .select(Waypoint.columns)
        .single();
    return Waypoint.fromJson(row);
  });

  @override
  Future<Waypoint> updateWaypoint({required String waypointId, required WaypointDraft draft}) => guard(() async {
    final row = await _client
        .from('waypoints')
        .update(draft.toJson())
        .eq('id', waypointId)
        .select(Waypoint.columns)
        .maybeSingle();
    return Waypoint.fromJson(row ?? (throw _forbidden));
  });

  @override
  Future<void> deleteWaypoint(String waypointId) => guard(() async {
    final rows = await _client.from('waypoints').delete().eq('id', waypointId).select('id');
    if (rows.isEmpty) throw _forbidden;
  });
}
