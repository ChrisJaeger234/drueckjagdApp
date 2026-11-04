import 'app_user.dart';

/// Authentifizierung – unabhängig von der konkreten Backend-Implementierung.
abstract interface class AuthRepository {
  /// Aktueller Benutzer oder `null`.
  AppUser? get currentUser;

  /// Liefert sofort den aktuellen Zustand und danach jede Änderung.
  Stream<AppUser?> authStateChanges();

  Future<SignUpResult> signUp({required String email, required String password});

  Future<void> signIn({required String email, required String password});

  Future<void> signOut();

  Future<void> resendConfirmationEmail(String email);
}
