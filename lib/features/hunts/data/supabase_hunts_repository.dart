import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/errors/app_exception.dart';
import '../../../core/errors/error_mapper.dart';
import '../domain/hunt.dart';
import '../domain/hunt_enums.dart';
import '../domain/hunt_participant.dart';
import '../domain/hunt_report.dart';
import '../domain/hunt_stand.dart';
import '../domain/hunt_zone.dart';
import '../domain/hunts_repository.dart';

class SupabaseHuntsRepository implements HuntsRepository {
  SupabaseHuntsRepository(this._client);

  final SupabaseClient _client;

  static const _forbidden = AppException('Dafür fehlen dir die Berechtigungen.', kind: AppErrorKind.forbidden);

  /// UPDATE/DELETE ohne Treffer bedeutet bei RLS: nicht berechtigt (oder nicht vorhanden).
  static Map<String, dynamic> _requireRow(Map<String, dynamic>? row) => row ?? (throw _forbidden);

  static void _requireAny(List<Map<String, dynamic>> rows) {
    if (rows.isEmpty) throw _forbidden;
  }

  // ---------------------------------------------------------------------------
  // Jagden
  // ---------------------------------------------------------------------------
  @override
  Future<List<Hunt>> fetchAll() => guard(() async {
    final rows = await _client.from('hunts').select(Hunt.columns).order('starts_at', ascending: false);
    return rows.map(Hunt.fromJson).toList();
  });

  @override
  Future<List<Hunt>> fetchForGroup(String groupId) => guard(() async {
    final rows = await _client
        .from('hunts')
        .select(Hunt.columns)
        .eq('group_id', groupId)
        .order('starts_at', ascending: false);
    return rows.map(Hunt.fromJson).toList();
  });

  @override
  Future<Hunt> fetchById(String huntId) => guard(() async {
    final row = await _client.from('hunts').select(Hunt.columns).eq('id', huntId).maybeSingle();
    if (row == null) {
      throw const AppException('Diese Jagd existiert nicht oder du hast keinen Zugriff.', kind: AppErrorKind.notFound);
    }
    return Hunt.fromJson(row);
  });

  @override
  Future<Hunt> create({required String groupId, required HuntDraft draft}) => guard(() async {
    final row = await _client
        .from('hunts')
        .insert({...draft.toJson(), 'group_id': groupId})
        .select(Hunt.columns)
        .single();
    return Hunt.fromJson(row);
  });

  @override
  Future<Hunt> update({required String huntId, required HuntDraft draft}) => guard(() async {
    final row = await _client.from('hunts').update(draft.toJson()).eq('id', huntId).select(Hunt.columns).maybeSingle();
    return Hunt.fromJson(_requireRow(row));
  });

  @override
  Future<Hunt> setStatus({required String huntId, required HuntStatus status}) => guard(() async {
    final row = await _client
        .from('hunts')
        .update({'status': status.value})
        .eq('id', huntId)
        .select(Hunt.columns)
        .maybeSingle();
    return Hunt.fromJson(_requireRow(row));
  });

  @override
  Future<void> delete(String huntId) => guard(() async {
    _requireAny(await _client.from('hunts').delete().eq('id', huntId).select('id'));
  });

  // ---------------------------------------------------------------------------
  // Teilnehmer
  // ---------------------------------------------------------------------------
  @override
  Future<List<HuntParticipant>> fetchParticipants(String huntId) => guard(() async {
    final rows = await _client.from('hunt_participants').select(HuntParticipant.columns).eq('hunt_id', huntId);
    final list = rows.map(HuntParticipant.fromJson).toList()
      ..sort((a, b) {
        final byRole = a.role.index.compareTo(b.role.index);
        return byRole != 0 ? byRole : a.name.toLowerCase().compareTo(b.name.toLowerCase());
      });
    return list;
  });

  @override
  Future<HuntParticipant> join({required String huntId, required HuntRole role, String note = ''}) => guard(() async {
    final row = await _client
        .from('hunt_participants')
        .insert({'hunt_id': huntId, 'role': role.value, 'note': note.trim()})
        .select(HuntParticipant.columns)
        .single();
    return HuntParticipant.fromJson(row);
  });

  @override
  Future<HuntParticipant> addParticipant({required String huntId, required String userId, required HuntRole role}) =>
      guard(() async {
        final row = await _client
            .from('hunt_participants')
            .insert({'hunt_id': huntId, 'user_id': userId, 'role': role.value})
            .select(HuntParticipant.columns)
            .single();
        return HuntParticipant.fromJson(row);
      });

  @override
  Future<HuntParticipant> updateParticipant({required String participantId, HuntRole? role, String? note}) =>
      guard(() async {
        final row = await _client
            .from('hunt_participants')
            .update({if (role != null) 'role': role.value, if (note != null) 'note': note.trim()})
            .eq('id', participantId)
            .select(HuntParticipant.columns)
            .maybeSingle();
        return HuntParticipant.fromJson(_requireRow(row));
      });

  @override
  Future<HuntParticipant> assign({required String participantId, String? standId, String? zoneId}) => guard(() async {
    final row = await _client
        .from('hunt_participants')
        .update({'stand_id': standId, 'zone_id': zoneId})
        .eq('id', participantId)
        .select(HuntParticipant.columns)
        .maybeSingle();
    return HuntParticipant.fromJson(_requireRow(row));
  });

  @override
  Future<void> removeParticipant(String participantId) => guard(() async {
    _requireAny(await _client.from('hunt_participants').delete().eq('id', participantId).select('id'));
  });

  // ---------------------------------------------------------------------------
  // Zonen
  // ---------------------------------------------------------------------------
  @override
  Future<List<HuntZone>> fetchZones(String huntId) => guard(() async {
    final rows = await _client.from('hunt_zones').select(HuntZone.columns).eq('hunt_id', huntId).order('name');
    return rows.map(HuntZone.fromJson).toList();
  });

  @override
  Future<HuntZone> createZone({
    required String huntId,
    required String name,
    required HuntZoneKind kind,
    required Map<String, dynamic> boundary,
    String description = '',
    String? color,
  }) => guard(() async {
    final row = await _client
        .from('hunt_zones')
        .insert({
          'hunt_id': huntId,
          'name': name.trim(),
          'kind': kind.value,
          'boundary_data': boundary,
          'description': description.trim(),
          'color': color,
        })
        .select(HuntZone.columns)
        .single();
    return HuntZone.fromJson(row);
  });

  @override
  Future<void> deleteZone(String zoneId) => guard(() async {
    _requireAny(await _client.from('hunt_zones').delete().eq('id', zoneId).select('id'));
  });

  // ---------------------------------------------------------------------------
  // Stände
  // ---------------------------------------------------------------------------
  static Map<String, dynamic> _standJson({
    required String label,
    required double latitude,
    required double longitude,
    String? waypointId,
    String? zoneId,
    required String description,
    required int sortOrder,
  }) => {
    'label': label.trim(),
    'latitude': latitude,
    'longitude': longitude,
    'waypoint_id': waypointId,
    'zone_id': zoneId,
    'description': description.trim(),
    'sort_order': sortOrder,
  };

  @override
  Future<List<HuntStand>> fetchStands(String huntId) => guard(() async {
    final rows = await _client
        .from('hunt_stands')
        .select(HuntStand.columns)
        .eq('hunt_id', huntId)
        .order('sort_order')
        .order('label');
    return rows.map(HuntStand.fromJson).toList();
  });

  @override
  Future<HuntStand> createStand({
    required String huntId,
    required String label,
    required double latitude,
    required double longitude,
    String? waypointId,
    String? zoneId,
    String description = '',
    int sortOrder = 0,
  }) => guard(() async {
    final row = await _client
        .from('hunt_stands')
        .insert({
          'hunt_id': huntId,
          ..._standJson(
            label: label,
            latitude: latitude,
            longitude: longitude,
            waypointId: waypointId,
            zoneId: zoneId,
            description: description,
            sortOrder: sortOrder,
          ),
        })
        .select(HuntStand.columns)
        .single();
    return HuntStand.fromJson(row);
  });

  @override
  Future<HuntStand> updateStand({
    required String standId,
    required String label,
    required double latitude,
    required double longitude,
    String? waypointId,
    String? zoneId,
    String description = '',
    int sortOrder = 0,
  }) => guard(() async {
    final row = await _client
        .from('hunt_stands')
        .update(
          _standJson(
            label: label,
            latitude: latitude,
            longitude: longitude,
            waypointId: waypointId,
            zoneId: zoneId,
            description: description,
            sortOrder: sortOrder,
          ),
        )
        .eq('id', standId)
        .select(HuntStand.columns)
        .maybeSingle();
    return HuntStand.fromJson(_requireRow(row));
  });

  @override
  Future<void> deleteStand(String standId) => guard(() async {
    _requireAny(await _client.from('hunt_stands').delete().eq('id', standId).select('id'));
  });

  // ---------------------------------------------------------------------------
  // Meldungen
  // ---------------------------------------------------------------------------
  @override
  Future<List<HuntReport>> fetchReports(String huntId) => guard(() async {
    final rows = await _client
        .from('hunt_reports')
        .select(HuntReport.columns)
        .eq('hunt_id', huntId)
        .order('occurred_at', ascending: false);
    return rows.map(HuntReport.fromJson).toList();
  });

  @override
  Future<HuntReport> createReport(HuntReportDraft draft) => guard(() async {
    final row = await _client.from('hunt_reports').insert(draft.toJson()).select(HuntReport.columns).single();
    return HuntReport.fromJson(row);
  });

  @override
  Future<HuntReport> setReportResolved({required String reportId, required bool resolved}) => guard(() async {
    final row = await _client
        .from('hunt_reports')
        .update({'resolved_at': resolved ? DateTime.now().toUtc().toIso8601String() : null})
        .eq('id', reportId)
        .select(HuntReport.columns)
        .maybeSingle();
    return HuntReport.fromJson(_requireRow(row));
  });

  @override
  Future<void> deleteReport(String reportId) => guard(() async {
    _requireAny(await _client.from('hunt_reports').delete().eq('id', reportId).select('id'));
  });
}
