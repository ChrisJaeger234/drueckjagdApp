import 'package:drueckjagd_app/app/router/auth_redirect.dart';
import 'package:drueckjagd_app/app/router/routes.dart';
import 'package:drueckjagd_app/features/authentication/presentation/auth_providers.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('während der Initialisierung immer Startbildschirm', () {
    expect(authRedirect(status: AuthStatus.initializing, location: Routes.overview), Routes.splash);
    expect(authRedirect(status: AuthStatus.initializing, location: Routes.splash), isNull);
  });

  test('abgemeldet: geschützte Seiten → Anmeldung', () {
    expect(authRedirect(status: AuthStatus.signedOut, location: Routes.splash), Routes.login);
    expect(authRedirect(status: AuthStatus.signedOut, location: Routes.group('g1')), Routes.login);
    expect(authRedirect(status: AuthStatus.signedOut, location: Routes.login), isNull);
    expect(authRedirect(status: AuthStatus.signedOut, location: Routes.register), isNull);
  });

  test('angemeldet: Start/Anmeldung → Übersicht, sonst bleiben', () {
    expect(authRedirect(status: AuthStatus.signedIn, location: Routes.splash), Routes.overview);
    expect(authRedirect(status: AuthStatus.signedIn, location: Routes.login), Routes.overview);
    expect(authRedirect(status: AuthStatus.signedIn, location: Routes.register), Routes.overview);
    expect(authRedirect(status: AuthStatus.signedIn, location: Routes.group('g1')), isNull);
  });
}
