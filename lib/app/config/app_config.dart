import 'dart:convert';

/// Laufzeitkonfiguration der App.
///
/// Werte werden zur Build-Zeit über `--dart-define-from-file=.env` (oder
/// einzelne `--dart-define`-Argumente) gesetzt und niemals im Quellcode
/// hinterlegt.
class AppConfig {
  const AppConfig({
    required this.supabaseUrl,
    required this.supabaseAnonKey,
    this.authRedirectUrl,
    this.mapboxAccessToken = '',
  });

  /// Liest die Konfiguration aus den Dart-Defines.
  factory AppConfig.fromEnvironment() {
    const url = String.fromEnvironment('SUPABASE_URL');
    const anonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
    const publishableKey = String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY');
    const redirect = String.fromEnvironment('AUTH_REDIRECT_URL');
    const mapbox = String.fromEnvironment('MAPBOX_ACCESS_TOKEN');
    return AppConfig(
      supabaseUrl: url.trim(),
      supabaseAnonKey: (publishableKey.isNotEmpty ? publishableKey : anonKey).trim(),
      authRedirectUrl: redirect.trim().isEmpty ? null : redirect.trim(),
      mapboxAccessToken: mapbox.trim(),
    );
  }

  /// Standard-Deeplink für Bestätigungs-E-Mails (siehe docs/SETUP.md).
  static const defaultAuthRedirectUrl = 'de.drueckjagd.app://login-callback';

  final String supabaseUrl;
  final String supabaseAnonKey;
  final String? authRedirectUrl;

  /// Öffentlicher Mapbox-Token (`pk.…`). Leer: Karte nutzt OpenStreetMap.
  final String mapboxAccessToken;

  bool get hasMapbox => mapboxAccessToken.startsWith('pk.');

  String get effectiveAuthRedirectUrl => authRedirectUrl ?? defaultAuthRedirectUrl;

  /// Liefert alle Konfigurationsprobleme. Leere Liste = gültig.
  List<String> validate() {
    final problems = <String>[];

    if (supabaseUrl.isEmpty) {
      problems.add('SUPABASE_URL ist nicht gesetzt.');
    } else {
      final uri = Uri.tryParse(supabaseUrl);
      if (uri == null || !(uri.scheme == 'https' || uri.scheme == 'http') || uri.host.isEmpty) {
        problems.add('SUPABASE_URL ist keine gültige http(s)-Adresse.');
      }
    }

    if (supabaseAnonKey.isEmpty) {
      problems.add('SUPABASE_ANON_KEY bzw. SUPABASE_PUBLISHABLE_KEY ist nicht gesetzt.');
    } else if (isPrivilegedKey(supabaseAnonKey)) {
      problems.add(
        'Der hinterlegte Schlüssel ist ein Secret- bzw. Service-Role-Key. '
        'Diese dürfen niemals in der mobilen App verwendet werden.',
      );
    }

    if (mapboxAccessToken.startsWith('sk.')) {
      problems.add(
        'MAPBOX_ACCESS_TOKEN ist ein geheimer Token (sk.…). In der App nur öffentliche Tokens (pk.…) verwenden.',
      );
    }

    if (authRedirectUrl != null && Uri.tryParse(authRedirectUrl!)?.hasScheme != true) {
      problems.add('AUTH_REDIRECT_URL ist keine gültige URL.');
    }

    return problems;
  }

  bool get isValid => validate().isEmpty;

  /// Erkennt Schlüssel mit Administratorrechten (neues `sb_secret_`-Format
  /// oder klassischer JWT mit `role: service_role`).
  static bool isPrivilegedKey(String key) {
    if (key.startsWith('sb_secret_')) return true;
    final parts = key.split('.');
    if (parts.length != 3) return false;
    try {
      final payload = utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
      final json = jsonDecode(payload);
      return json is Map && json['role'] == 'service_role';
    } on FormatException {
      return false;
    }
  }
}
