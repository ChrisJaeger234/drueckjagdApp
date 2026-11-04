/// Fachlicher Fehler mit einer für Benutzer verständlichen (deutschen) Meldung.
class AppException implements Exception {
  const AppException(this.message, {this.kind = AppErrorKind.unknown, this.cause});

  final String message;
  final AppErrorKind kind;
  final Object? cause;

  @override
  String toString() => 'AppException($kind): $message';
}

enum AppErrorKind {
  network,
  unauthenticated,
  invalidCredentials,
  emailNotConfirmed,
  emailAlreadyRegistered,
  weakPassword,
  rateLimited,
  forbidden,
  notFound,
  conflict,
  validation,
  configuration,
  unknown,
}
