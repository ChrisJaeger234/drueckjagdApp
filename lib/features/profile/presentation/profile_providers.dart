import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/services/supabase_service.dart';
import '../../authentication/presentation/auth_providers.dart';
import '../data/supabase_profile_repository.dart';
import '../domain/profile.dart';
import '../domain/profile_repository.dart';

final profileRepositoryProvider = Provider<ProfileRepository>(
  (ref) => SupabaseProfileRepository(ref.watch(supabaseClientProvider)),
);

/// Profil des angemeldeten Benutzers.
final currentProfileProvider = FutureProvider.autoDispose<Profile>((ref) {
  final userId = ref.watch(currentUserIdProvider);
  return ref.watch(profileRepositoryProvider).fetchProfile(userId);
});
