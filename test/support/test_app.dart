import 'package:drueckjagd_app/app/app.dart';
import 'package:drueckjagd_app/core/services/supabase_service.dart';
import 'package:drueckjagd_app/features/authentication/presentation/auth_providers.dart';
import 'package:drueckjagd_app/features/groups/presentation/groups_providers.dart';
import 'package:drueckjagd_app/features/hunting_grounds/presentation/reviere_providers.dart';
import 'package:drueckjagd_app/features/profile/presentation/profile_providers.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'fakes.dart';

/// Baut die komplette App mit In-Memory-Repositories (ohne Netzwerk).
class TestApp {
  TestApp({FakeAuthRepository? auth})
      : auth = auth ?? FakeAuthRepository(),
        profiles = FakeProfileRepository(),
        reviere = FakeReviereRepository() {
    groups = FakeGroupsRepository(currentUserId: 'user-1');
  }

  final FakeAuthRepository auth;
  final FakeProfileRepository profiles;
  final FakeReviereRepository reviere;
  late final FakeGroupsRepository groups;

  /// Nie benutzter Platzhalter-Client: alle Repositories sind überschrieben.
  static final _unusedClient = SupabaseClient(
    'http://127.0.0.1:9',
    'test-key',
    authOptions: const AuthClientOptions(autoRefreshToken: false),
  );

  Widget build() => ProviderScope(
        retry: (_, _) => null,
        overrides: [
          splashMinimumDurationProvider.overrideWithValue(Duration.zero),
          appStartupProvider.overrideWith((ref) async => _unusedClient),
          authRepositoryProvider.overrideWithValue(auth),
          profileRepositoryProvider.overrideWithValue(profiles),
          groupsRepositoryProvider.overrideWithValue(groups),
          reviereRepositoryProvider.overrideWithValue(reviere),
        ],
        child: const DrueckjagdApp(),
      );
}
