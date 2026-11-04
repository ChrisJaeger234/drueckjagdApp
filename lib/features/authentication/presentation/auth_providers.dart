import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/services/supabase_service.dart';
import '../data/supabase_auth_repository.dart';
import '../domain/auth_repository.dart';
import '../domain/app_user.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final client = ref.watch(supabaseClientProvider);
  final config = ref.watch(appConfigProvider);
  return SupabaseAuthRepository(client, emailRedirectUrl: config.effectiveAuthRedirectUrl);
});

/// Stream des angemeldeten Benutzers.
final appUserProvider = StreamProvider<AppUser?>((ref) {
  return ref.watch(authRepositoryProvider).authStateChanges();
});

enum AuthStatus { initializing, signedOut, signedIn }

/// Zusammengefasster Status für Router und Startbildschirm.
final authStatusProvider = Provider<AuthStatus>((ref) {
  final startup = ref.watch(appStartupProvider);
  if (!startup.hasValue) return AuthStatus.initializing;

  final user = ref.watch(appUserProvider);
  final current = user.hasValue ? user.value : ref.read(authRepositoryProvider).currentUser;
  return current == null ? AuthStatus.signedOut : AuthStatus.signedIn;
});

/// ID des angemeldeten Benutzers. Wirft, wenn niemand angemeldet ist.
final currentUserIdProvider = Provider<String>((ref) {
  ref.watch(appUserProvider);
  final user = ref.watch(authRepositoryProvider).currentUser;
  if (user == null) throw StateError('Kein Benutzer angemeldet.');
  return user.id;
});

/// Steuert Anmelden / Registrieren / Abmelden und stellt den Ladezustand bereit.
class AuthController extends AsyncNotifier<void> {
  @override
  Future<void> build() async {}

  AuthRepository get _repo => ref.read(authRepositoryProvider);

  Future<bool> signIn({required String email, required String password}) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _repo.signIn(email: email, password: password));
    return !state.hasError;
  }

  /// Liefert `null` bei Fehler, sonst das Ergebnis.
  Future<SignUpResult?> signUp({required String email, required String password}) async {
    state = const AsyncLoading();
    SignUpResult? result;
    state = await AsyncValue.guard(() async {
      result = await _repo.signUp(email: email, password: password);
    });
    return state.hasError ? null : result;
  }

  Future<bool> resendConfirmation(String email) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() => _repo.resendConfirmationEmail(email));
    return !state.hasError;
  }

  Future<void> signOut() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_repo.signOut);
  }
}

final authControllerProvider = AsyncNotifierProvider<AuthController, void>(AuthController.new);
