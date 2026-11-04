import 'dart:convert';

import 'package:drueckjagd_app/app/config/app_config.dart';
import 'package:flutter_test/flutter_test.dart';

String _jwt(Map<String, Object> payload) {
  String enc(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${enc({'alg': 'HS256'})}.${enc(payload)}.signature';
}

void main() {
  group('AppConfig.validate', () {
    test('gültige Konfiguration hat keine Probleme', () {
      const config = AppConfig(supabaseUrl: 'https://abc.supabase.co', supabaseAnonKey: 'sb_publishable_123');
      expect(config.validate(), isEmpty);
      expect(config.isValid, isTrue);
    });

    test('fehlende Werte werden gemeldet', () {
      const config = AppConfig(supabaseUrl: '', supabaseAnonKey: '');
      expect(config.validate(), hasLength(2));
    });

    test('ungültige URL wird abgelehnt', () {
      const config = AppConfig(supabaseUrl: 'abc.supabase.co', supabaseAnonKey: 'sb_publishable_123');
      expect(config.validate().single, contains('SUPABASE_URL'));
    });

    test('Secret-Key (neues Format) wird abgelehnt', () {
      const config = AppConfig(supabaseUrl: 'https://abc.supabase.co', supabaseAnonKey: 'sb_secret_abc');
      expect(config.validate().single, contains('Service-Role'));
    });

    test('Service-Role-JWT wird abgelehnt, anon-JWT akzeptiert', () {
      expect(AppConfig.isPrivilegedKey(_jwt({'role': 'service_role'})), isTrue);
      expect(AppConfig.isPrivilegedKey(_jwt({'role': 'anon'})), isFalse);
      expect(AppConfig.isPrivilegedKey('kein.gültiger.jwt'), isFalse);
    });

    test('Standard-Redirect wird verwendet, wenn nichts gesetzt ist', () {
      const config = AppConfig(supabaseUrl: 'https://abc.supabase.co', supabaseAnonKey: 'k');
      expect(config.effectiveAuthRedirectUrl, AppConfig.defaultAuthRedirectUrl);
    });

    test('ohne Dart-Defines ist die Konfiguration ungültig (keine Scheinverbindung)', () {
      expect(AppConfig.fromEnvironment().isValid, isFalse);
    });
  });
}
