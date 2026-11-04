import '../../features/authentication/presentation/auth_providers.dart';
import 'routes.dart';

/// Reine Funktion für die Weiterleitungslogik – separat testbar.
///
/// * Während der Initialisierung: Startbildschirm.
/// * Nicht angemeldet: nur Anmeldung/Registrierung.
/// * Angemeldet: Start-, Anmelde- und Registrierungsseite → Übersicht.
String? authRedirect({required AuthStatus status, required String location}) {
  switch (status) {
    case AuthStatus.initializing:
      return location == Routes.splash ? null : Routes.splash;
    case AuthStatus.signedOut:
      return Routes.public.contains(location) ? null : Routes.login;
    case AuthStatus.signedIn:
      if (location == Routes.splash || Routes.public.contains(location)) return Routes.overview;
      return null;
  }
}
