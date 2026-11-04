import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../app/config/app_config.dart';
import '../errors/app_exception.dart';

/// Konfiguration aus den Dart-Defines. In Tests überschreibbar.
final appConfigProvider = Provider<AppConfig>((ref) => AppConfig.fromEnvironment());

/// Kapselt `Supabase.initialize`, damit Tests ohne Backend auskommen.
abstract interface class SupabaseInitializer {
  Future<SupabaseClient> initialize(AppConfig config);
}

class DefaultSupabaseInitializer implements SupabaseInitializer {
  const DefaultSupabaseInitializer();

  @override
  Future<SupabaseClient> initialize(AppConfig config) async {
    final supabase = await Supabase.initialize(
      url: config.supabaseUrl,
      publishableKey: config.supabaseAnonKey,
      authOptions: const FlutterAuthClientOptions(authFlowType: AuthFlowType.pkce),
    );
    return supabase.client;
  }
}

final supabaseInitializerProvider = Provider<SupabaseInitializer>((ref) => const DefaultSupabaseInitializer());

/// Mindestanzeigedauer des Startbildschirms (verhindert Flackern).
final splashMinimumDurationProvider = Provider<Duration>((ref) => const Duration(milliseconds: 900));

/// App-Start: Konfiguration prüfen und Supabase initialisieren.
///
/// Schlägt mit [AppErrorKind.configuration] fehl, wenn keine gültigen
/// Zugangsdaten hinterlegt sind – es wird keine Scheinverbindung aufgebaut.
final appStartupProvider = FutureProvider<SupabaseClient>((ref) async {
  final config = ref.watch(appConfigProvider);
  final problems = config.validate();
  if (problems.isNotEmpty) {
    throw ConfigurationException(problems);
  }
  final results = await Future.wait<Object?>([
    ref.watch(supabaseInitializerProvider).initialize(config),
    Future<void>.delayed(ref.watch(splashMinimumDurationProvider)),
  ]);
  return results.first! as SupabaseClient;
});

/// Initialisierter Supabase-Client. Darf erst nach erfolgreichem
/// [appStartupProvider] gelesen werden (der Router stellt das sicher).
final supabaseClientProvider = Provider<SupabaseClient>((ref) => ref.watch(appStartupProvider).requireValue);

/// Fehlende oder ungültige Konfiguration.
class ConfigurationException extends AppException {
  ConfigurationException(this.problems)
    : super('Die App ist noch nicht mit Supabase verbunden.', kind: AppErrorKind.configuration);

  final List<String> problems;
}
