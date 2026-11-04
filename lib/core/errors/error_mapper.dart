import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:supabase_flutter/supabase_flutter.dart';

import 'app_exception.dart';

/// Übersetzt technische Fehler (Supabase, Netzwerk, …) zentral in
/// [AppException]s mit deutschen Meldungen.
abstract final class ErrorMapper {
  static AppException map(Object error) {
    if (error is AppException) return error;
    if (error is AuthException) return _mapAuth(error);
    if (error is PostgrestException) return _mapPostgrest(error);
    if (error is StorageException) {
      return AppException('Die Datei konnte nicht verarbeitet werden.', cause: error);
    }
    if (error is SocketException || error is TimeoutException || error is HttpException) {
      return AppException(
        'Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.',
        kind: AppErrorKind.network,
        cause: error,
      );
    }
    final text = error.toString();
    if (text.contains('ClientException') || text.contains('Failed host lookup')) {
      return AppException(
        'Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.',
        kind: AppErrorKind.network,
        cause: error,
      );
    }
    return AppException('Unerwarteter Fehler. Bitte versuche es erneut.', cause: error);
  }

  static AppException _mapAuth(AuthException e) {
    final code = e.code ?? '';
    final message = e.message.toLowerCase();

    if (code == 'invalid_credentials' || message.contains('invalid login credentials')) {
      return AppException('E-Mail-Adresse oder Passwort ist falsch.', kind: AppErrorKind.invalidCredentials, cause: e);
    }
    if (code == 'email_not_confirmed' || message.contains('email not confirmed')) {
      return AppException(
        'Bitte bestätige zuerst deine E-Mail-Adresse über den Link in der Bestätigungs-Mail.',
        kind: AppErrorKind.emailNotConfirmed,
        cause: e,
      );
    }
    if (code == 'user_already_exists' || code == 'email_exists' || message.contains('already registered')) {
      return AppException(
        'Für diese E-Mail-Adresse existiert bereits ein Konto.',
        kind: AppErrorKind.emailAlreadyRegistered,
        cause: e,
      );
    }
    if (code == 'weak_password' || e is AuthWeakPasswordException) {
      return AppException(
        'Das Passwort ist zu schwach. Bitte wähle ein längeres Passwort.',
        kind: AppErrorKind.weakPassword,
        cause: e,
      );
    }
    if (code.startsWith('over_') || e.statusCode == '429') {
      return AppException(
        'Zu viele Versuche. Bitte warte einen Moment und versuche es erneut.',
        kind: AppErrorKind.rateLimited,
        cause: e,
      );
    }
    if (code == 'session_not_found' || code == 'refresh_token_not_found' || e is AuthSessionMissingException) {
      return AppException(
        'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.',
        kind: AppErrorKind.unauthenticated,
        cause: e,
      );
    }
    if (e is AuthRetryableFetchException) {
      return AppException(
        'Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.',
        kind: AppErrorKind.network,
        cause: e,
      );
    }
    return AppException('Anmeldung fehlgeschlagen: ${e.message}', kind: AppErrorKind.unknown, cause: e);
  }

  /// Fehlerschlüssel aus den SQL-Funktionen (siehe Migration 0004).
  static const _rpcMessages = <String, (String, AppErrorKind)>{
    'not_authenticated': ('Bitte melde dich an.', AppErrorKind.unauthenticated),
    'not_authorized': ('Dafür fehlen dir die Berechtigungen in dieser Gruppe.', AppErrorKind.forbidden),
    'too_many_attempts': (
      'Zu viele ungültige Einladungscodes. Bitte versuche es in 15 Minuten erneut.',
      AppErrorKind.rateLimited,
    ),
    'last_owner': (
      'Du bist der einzige Owner. Ernenne zuerst ein anderes Mitglied zum Owner oder lösche die Gruppe.',
      AppErrorKind.conflict,
    ),
    'member_not_found': ('Dieses Mitglied wurde nicht gefunden.', AppErrorKind.notFound),
    'use_leave_group': ('Um dich selbst zu entfernen, verlasse die Gruppe.', AppErrorKind.validation),
    'invalid_validity': ('Die Gültigkeitsdauer ist ungültig (1 Stunde bis 90 Tage).', AppErrorKind.validation),
    'invalid_max_uses': ('Die maximale Anzahl an Nutzungen ist ungültig (1–500).', AppErrorKind.validation),
    // Phase 2 (Migrationen 0009/0010)
    'invalid_boundary': (
      'Die Fläche ist ungültig. Bitte zeichne ein geschlossenes Polygon oder importiere eine gültige Datei.',
      AppErrorKind.validation,
    ),
    'not_a_group_member': ('Diese Person ist kein Mitglied der Gruppe.', AppErrorKind.validation),
    'waypoint_not_in_group': ('Diese Einrichtung gehört nicht zu einem Revier der Gruppe.', AppErrorKind.validation),
  };

  /// postgrest-dart (2.9) verpackt Fehler bei `.maybeSingle()` falsch: Die
  /// Nachricht enthält dann den rohen JSON-Text der Antwort und `code` ist der
  /// HTTP-Status. Hier wird die eigentliche Fehlermeldung wiederhergestellt.
  static PostgrestException _unwrap(PostgrestException e) {
    final raw = e.message.trimLeft();
    if (!raw.startsWith('{')) return e;
    try {
      final json = jsonDecode(raw);
      if (json is Map<String, dynamic> && json['message'] is String) {
        return PostgrestException(
          message: json['message'] as String,
          code: json['code']?.toString() ?? e.code,
          details: json['details'] ?? e.details,
          hint: json['hint']?.toString() ?? e.hint,
        );
      }
    } on FormatException {
      // kein JSON – Original verwenden
    }
    return e;
  }

  static AppException _mapPostgrest(PostgrestException original) {
    final e = _unwrap(original);
    final rpc = _rpcMessages[e.message];
    if (rpc != null) return AppException(rpc.$1, kind: rpc.$2, cause: e);

    switch (e.code) {
      case '23505':
        if (e.message.contains('profiles_username_key')) {
          return AppException('Dieser Benutzername ist bereits vergeben.', kind: AppErrorKind.conflict, cause: e);
        }
        if (e.message.contains('reviere_group_name_key')) {
          return AppException(
            'In dieser Gruppe gibt es bereits ein Revier mit diesem Namen.',
            kind: AppErrorKind.conflict,
            cause: e,
          );
        }
        if (e.message.contains('hunt_stands_label_key')) {
          return AppException(
            'In dieser Jagd gibt es bereits einen Stand mit dieser Bezeichnung.',
            kind: AppErrorKind.conflict,
            cause: e,
          );
        }
        if (e.message.contains('hunt_participants_unique')) {
          return AppException('Diese Person ist bereits eingetragen.', kind: AppErrorKind.conflict, cause: e);
        }
        return AppException('Dieser Eintrag existiert bereits.', kind: AppErrorKind.conflict, cause: e);
      case '23514':
      case '22001':
        return AppException('Die Eingabe ist ungültig.', kind: AppErrorKind.validation, cause: e);
      case '42501':
        return AppException('Dafür fehlen dir die Berechtigungen.', kind: AppErrorKind.forbidden, cause: e);
      case 'PGRST116':
        return AppException('Der Eintrag wurde nicht gefunden.', kind: AppErrorKind.notFound, cause: e);
      case 'PGRST301':
      case 'PGRST303':
        return AppException(
          'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.',
          kind: AppErrorKind.unauthenticated,
          cause: e,
        );
    }
    return AppException('Serverfehler. Bitte versuche es erneut.', cause: e);
  }
}

/// Führt [action] aus und wandelt Fehler einheitlich in [AppException] um.
Future<T> guard<T>(Future<T> Function() action) async {
  try {
    return await action();
  } catch (e) {
    throw ErrorMapper.map(e);
  }
}
