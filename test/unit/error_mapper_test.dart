import 'dart:io';

import 'package:drueckjagd_app/core/errors/app_exception.dart';
import 'package:drueckjagd_app/core/errors/error_mapper.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

void main() {
  group('ErrorMapper – Auth', () {
    test('falsche Zugangsdaten', () {
      final e = ErrorMapper.map(const AuthException('Invalid login credentials', code: 'invalid_credentials'));
      expect(e.kind, AppErrorKind.invalidCredentials);
      expect(e.message, contains('falsch'));
    });
    test('E-Mail nicht bestätigt', () {
      final e = ErrorMapper.map(const AuthException('Email not confirmed', code: 'email_not_confirmed'));
      expect(e.kind, AppErrorKind.emailNotConfirmed);
    });
    test('bereits registriert', () {
      final e = ErrorMapper.map(const AuthException('User already registered', code: 'user_already_exists'));
      expect(e.kind, AppErrorKind.emailAlreadyRegistered);
    });
    test('Rate-Limit', () {
      final e = ErrorMapper.map(const AuthException('slow down', code: 'over_email_send_rate_limit'));
      expect(e.kind, AppErrorKind.rateLimited);
    });
  });

  group('ErrorMapper – Datenbank', () {
    test('Fehlerschlüssel der SQL-Funktionen', () {
      expect(
        ErrorMapper.map(const PostgrestException(message: 'last_owner', code: '23514')).kind,
        AppErrorKind.conflict,
      );
      expect(
        ErrorMapper.map(const PostgrestException(message: 'not_authorized', code: '42501')).kind,
        AppErrorKind.forbidden,
      );
      expect(
        ErrorMapper.map(const PostgrestException(message: 'too_many_attempts', code: '54000')).kind,
        AppErrorKind.rateLimited,
      );
    });
    test('doppelter Benutzername', () {
      final e = ErrorMapper.map(
        const PostgrestException(
          message: 'duplicate key value violates unique constraint "profiles_username_key"',
          code: '23505',
        ),
      );
      expect(e.message, contains('Benutzername'));
    });
    test('Fehlerschlüssel aus Phase 2', () {
      expect(
        ErrorMapper.map(const PostgrestException(message: 'invalid_boundary', code: '22023')).message,
        contains('Fläche ist ungültig'),
      );
      expect(
        ErrorMapper.map(const PostgrestException(message: 'waypoint_not_in_group', code: '23514')).kind,
        AppErrorKind.validation,
      );
      final dup = ErrorMapper.map(
        const PostgrestException(
          message: 'duplicate key value violates unique constraint "hunt_stands_label_key"',
          code: '23505',
        ),
      );
      expect(dup.message, contains('bereits einen Stand'));
    });
    test('roher JSON-Fehler aus maybeSingle() wird entpackt', () {
      final e = ErrorMapper.map(
        const PostgrestException(
          message: '{"code":"42501","details":null,"hint":null,"message":"not_authorized"}',
          code: '403',
          details: 'Forbidden',
        ),
      );
      expect(e.kind, AppErrorKind.forbidden);
      expect(e.message, contains('Berechtigungen'));
      final unknown = ErrorMapper.map(const PostgrestException(message: '{kaputt', code: '500'));
      expect(unknown.kind, AppErrorKind.unknown);
    });
    test('fehlende Rechte', () {
      final e = ErrorMapper.map(const PostgrestException(message: 'permission denied', code: '42501'));
      expect(e.kind, AppErrorKind.forbidden);
    });
  });

  test('Netzwerkfehler', () {
    expect(ErrorMapper.map(const SocketException('down')).kind, AppErrorKind.network);
  });

  test('AppException wird unverändert durchgereicht', () {
    const original = AppException('x', kind: AppErrorKind.validation);
    expect(identical(ErrorMapper.map(original), original), isTrue);
  });

  test('guard wandelt Fehler um', () async {
    await expectLater(
      guard<void>(() async => throw const SocketException('down')),
      throwsA(isA<AppException>().having((e) => e.kind, 'kind', AppErrorKind.network)),
    );
  });
}
