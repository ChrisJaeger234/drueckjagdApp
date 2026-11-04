import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/errors/app_exception.dart';
import '../../../core/errors/error_mapper.dart';
import '../domain/revier.dart';
import '../domain/reviere_repository.dart';

class SupabaseReviereRepository implements ReviereRepository {
  SupabaseReviereRepository(this._client);

  final SupabaseClient _client;

  static List<Revier> _sorted(List<Map<String, dynamic>> rows) => rows.map(Revier.fromJson).toList()
    ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));

  @override
  Future<List<Revier>> fetchAll() => guard(() async {
        final rows = await _client.from('reviere').select(Revier.columns);
        return _sorted(rows);
      });

  @override
  Future<List<Revier>> fetchForGroup(String groupId) => guard(() async {
        final rows = await _client.from('reviere').select(Revier.columns).eq('group_id', groupId);
        return _sorted(rows);
      });

  @override
  Future<Revier> fetchById(String revierId) => guard(() async {
        final row = await _client.from('reviere').select(Revier.columns).eq('id', revierId).maybeSingle();
        if (row == null) {
          throw const AppException(
            'Dieses Revier existiert nicht oder du hast keinen Zugriff.',
            kind: AppErrorKind.notFound,
          );
        }
        return Revier.fromJson(row);
      });

  @override
  Future<Revier> create({
    required String groupId,
    required String createdBy,
    required String name,
    required String description,
  }) =>
      guard(() async {
        final row = await _client
            .from('reviere')
            .insert({
              'group_id': groupId,
              'created_by': createdBy,
              'name': name.trim(),
              'description': description.trim(),
            })
            .select(Revier.columns)
            .single();
        return Revier.fromJson(row);
      });

  @override
  Future<Revier> update({required String revierId, required String name, required String description}) =>
      guard(() async {
        final row = await _client
            .from('reviere')
            .update({'name': name.trim(), 'description': description.trim()})
            .eq('id', revierId)
            .select(Revier.columns)
            .maybeSingle();
        if (row == null) {
          throw const AppException('Dafür fehlen dir die Berechtigungen.', kind: AppErrorKind.forbidden);
        }
        return Revier.fromJson(row);
      });

  @override
  Future<void> delete(String revierId) => guard(() async {
        final rows = await _client.from('reviere').delete().eq('id', revierId).select('id');
        if (rows.isEmpty) {
          throw const AppException('Dafür fehlen dir die Berechtigungen.', kind: AppErrorKind.forbidden);
        }
      });
}
