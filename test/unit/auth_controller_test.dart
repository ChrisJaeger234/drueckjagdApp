import 'package:drueckjagd_app/core/errors/app_exception.dart';
import 'package:drueckjagd_app/core/services/supabase_service.dart';
import 'package:drueckjagd_app/features/authentication/domain/app_user.dart';
import 'package:drueckjagd_app/features/authentication/presentation/auth_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../support/fakes.dart';

void main() {
  late FakeAuthRepository repo;
  late ProviderContainer container;

  ProviderContainer create(FakeAuthRepository r) => ProviderContainer(
    retry: (_, _) => null,
    overrides: [
      splashMinimumDurationProvider.overrideWithValue(Duration.zero),
      appStartupProvider.overrideWith(
        (ref) async =>
            SupabaseClient('http://127.0.0.1:9', 'k', authOptions: const AuthClientOptions(autoRefreshToken: false)),
      ),
      authRepositoryProvider.overrideWithValue(r),
    ],
  );

  setUp(() {
    repo = FakeAuthRepository();
    container = create(repo);
  });
  tearDown(() => container.dispose());

  test('Status: initializing → signedOut → signedIn → signedOut', () async {
    final statuses = <AuthStatus>[];
    container.listen(authStatusProvider, (_, next) => statuses.add(next), fireImmediately: true);
    await container.read(appStartupProvider.future);
    await container.read(appUserProvider.future);
    expect(container.read(authStatusProvider), AuthStatus.signedOut);

    final ok = await container
        .read(authControllerProvider.notifier)
        .signIn(email: 'jaeger@example.de', password: 'geheim123');
    expect(ok, isTrue);
    await pumpEventQueue();
    expect(container.read(authStatusProvider), AuthStatus.signedIn);
    expect(container.read(currentUserIdProvider), 'user-1');

    await container.read(authControllerProvider.notifier).signOut();
    await pumpEventQueue();
    expect(container.read(authStatusProvider), AuthStatus.signedOut);
    expect(statuses.first, AuthStatus.initializing);
  });

  test('falsches Passwort liefert Fehlerzustand', () async {
    await container.read(appStartupProvider.future);
    final ok = await container
        .read(authControllerProvider.notifier)
        .signIn(email: 'jaeger@example.de', password: 'falsch');
    expect(ok, isFalse);
    final state = container.read(authControllerProvider);
    expect(state.error, isA<AppException>().having((e) => e.kind, 'kind', AppErrorKind.invalidCredentials));
  });

  test('Registrierung mit E-Mail-Bestätigung', () async {
    final confirmRepo = FakeAuthRepository(requireConfirmation: true);
    final c = create(confirmRepo);
    addTearDown(c.dispose);
    await c.read(appStartupProvider.future);
    final result = await c.read(authControllerProvider.notifier).signUp(email: 'neu@example.de', password: 'waidmann1');
    expect(result, SignUpResult.confirmationRequired);
    expect(confirmRepo.currentUser, isNull);
  });

  test('Registrierung einer vorhandenen E-Mail schlägt fehl', () async {
    await container.read(appStartupProvider.future);
    final result = await container
        .read(authControllerProvider.notifier)
        .signUp(email: 'jaeger@example.de', password: 'waidmann1');
    expect(result, isNull);
    expect(container.read(authControllerProvider).hasError, isTrue);
  });

  test('ungültige Konfiguration → ConfigurationException statt Verbindung', () async {
    final c = ProviderContainer(retry: (_, _) => null);
    addTearDown(c.dispose);
    await expectLater(c.read(appStartupProvider.future), throwsA(isA<ConfigurationException>()));
    expect(c.read(authStatusProvider), AuthStatus.initializing);
  });
}
