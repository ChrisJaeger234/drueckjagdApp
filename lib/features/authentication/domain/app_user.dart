/// Minimale, vom Backend unabhängige Sicht auf den angemeldeten Benutzer.
class AppUser {
  const AppUser({required this.id, required this.email, this.emailConfirmed = true});

  final String id;
  final String? email;
  final bool emailConfirmed;

  @override
  bool operator ==(Object other) =>
      other is AppUser && other.id == id && other.email == email && other.emailConfirmed == emailConfirmed;

  @override
  int get hashCode => Object.hash(id, email, emailConfirmed);
}

/// Ergebnis einer Registrierung.
enum SignUpResult {
  /// Konto angelegt und direkt angemeldet (E-Mail-Bestätigung deaktiviert).
  signedIn,

  /// Konto angelegt, Bestätigungs-E-Mail wurde verschickt.
  confirmationRequired,
}
