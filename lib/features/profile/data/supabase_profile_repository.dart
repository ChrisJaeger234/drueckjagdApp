import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/errors/error_mapper.dart';
import '../domain/profile.dart';
import '../domain/profile_repository.dart';

class SupabaseProfileRepository implements ProfileRepository {
  SupabaseProfileRepository(this._client);

  final SupabaseClient _client;

  @override
  Future<Profile> fetchProfile(String userId) => guard(() async {
        final row = await _client.from('profiles').select(Profile.columns).eq('id', userId).single();
        return Profile.fromJson(row);
      });

  @override
  Future<Profile> updateProfile({
    required String userId,
    required String username,
    required String displayName,
  }) =>
      guard(() async {
        final row = await _client
            .from('profiles')
            .update({
              'username': username.trim().toLowerCase(),
              'display_name': displayName.trim(),
            })
            .eq('id', userId)
            .select(Profile.columns)
            .single();
        return Profile.fromJson(row);
      });
}
