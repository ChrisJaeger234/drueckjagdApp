import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/errors/error_mapper.dart';
import '../domain/auth_repository.dart';
import '../domain/app_user.dart';

class SupabaseAuthRepository implements AuthRepository {
  SupabaseAuthRepository(this._client, {required this.emailRedirectUrl});

  final SupabaseClient _client;

  /// Ziel des Bestätigungslinks in der Registrierungs-E-Mail.
  final String? emailRedirectUrl;

  GoTrueClient get _auth => _client.auth;

  static AppUser? _map(User? user) =>
      user == null ? null : AppUser(id: user.id, email: user.email, emailConfirmed: user.emailConfirmedAt != null);

  @override
  AppUser? get currentUser => _map(_auth.currentUser);

  @override
  Stream<AppUser?> authStateChanges() => Stream<AppUser?>.multi((listener) {
    // Sofort den aktuellen Stand liefern und synchron abonnieren, damit
    // kein Ereignis zwischen Start und Abonnement verloren geht.
    listener.add(currentUser);
    final sub = _auth.onAuthStateChange
        .map((state) => _map(state.session?.user))
        .listen(listener.add, onError: listener.addError);
    listener.onCancel = sub.cancel;
  }).distinct();

  @override
  Future<SignUpResult> signUp({required String email, required String password}) => guard(() async {
    final response = await _auth.signUp(email: email.trim(), password: password, emailRedirectTo: emailRedirectUrl);
    return response.session != null ? SignUpResult.signedIn : SignUpResult.confirmationRequired;
  });

  @override
  Future<void> signIn({required String email, required String password}) => guard(() async {
    await _auth.signInWithPassword(email: email.trim(), password: password);
  });

  @override
  Future<void> signOut() => guard(() => _auth.signOut());

  @override
  Future<void> resendConfirmationEmail(String email) => guard(() async {
    await _auth.resend(type: OtpType.signup, email: email.trim(), emailRedirectTo: emailRedirectUrl);
  });
}
