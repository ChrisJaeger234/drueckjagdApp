/// Eingabevalidierung. Alle Funktionen liefern `null` bei gültiger Eingabe,
/// sonst eine deutsche Fehlermeldung (kompatibel zu `TextFormField.validator`).
abstract final class Validators {
  static final _email = RegExp(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$");
  static final _username = RegExp(r'^[a-z0-9_]{3,24}$');
  static final _inviteAlphabet = RegExp(r'^[0-9A-HJKMNP-TV-Z]{12}$');

  static const minPasswordLength = 8;

  static String? email(String? value) {
    final v = value?.trim() ?? '';
    if (v.isEmpty) return 'Bitte gib deine E-Mail-Adresse ein.';
    if (!_email.hasMatch(v)) return 'Bitte gib eine gültige E-Mail-Adresse ein.';
    return null;
  }

  static String? password(String? value) {
    final v = value ?? '';
    if (v.isEmpty) return 'Bitte gib ein Passwort ein.';
    if (v.length < minPasswordLength) {
      return 'Das Passwort muss mindestens $minPasswordLength Zeichen lang sein.';
    }
    if (!RegExp('[A-Za-zÄÖÜäöüß]').hasMatch(v) || !RegExp(r'\d').hasMatch(v)) {
      return 'Das Passwort muss Buchstaben und Ziffern enthalten.';
    }
    return null;
  }

  /// Für die Anmeldung reicht eine nicht-leere Eingabe.
  static String? loginPassword(String? value) =>
      (value == null || value.isEmpty) ? 'Bitte gib dein Passwort ein.' : null;

  static String? passwordConfirmation(String? value, String password) {
    if (value == null || value.isEmpty) return 'Bitte bestätige dein Passwort.';
    if (value != password) return 'Die Passwörter stimmen nicht überein.';
    return null;
  }

  static String? username(String? value) {
    final v = value?.trim() ?? '';
    if (v.isEmpty) return 'Bitte wähle einen Benutzernamen.';
    if (!_username.hasMatch(v)) {
      return '3–24 Zeichen, nur Kleinbuchstaben, Ziffern und Unterstrich.';
    }
    return null;
  }

  static String? displayName(String? value) {
    final v = value?.trim() ?? '';
    if (v.isEmpty) return 'Bitte gib einen Anzeigenamen ein.';
    if (v.length > 60) return 'Höchstens 60 Zeichen.';
    return null;
  }

  static String? groupName(String? value) => _requiredLength(value, 'Gruppennamen', 2, 80);

  static String? revierName(String? value) => _requiredLength(value, 'Reviernamen', 2, 120);

  static String? Function(String?) maxLength(int max) =>
      (value) => (value?.trim().length ?? 0) > max ? 'Höchstens $max Zeichen.' : null;

  static String? inviteCode(String? value) {
    final normalized = normalizeInviteCode(value ?? '');
    if (normalized.isEmpty) return 'Bitte gib einen Einladungscode ein.';
    if (!_inviteAlphabet.hasMatch(normalized)) {
      return 'Der Code besteht aus 12 Zeichen, z. B. ABCD-EFGH-JKMN.';
    }
    return null;
  }

  /// Entspricht `private.normalize_invite_code` in der Datenbank.
  static String normalizeInviteCode(String code) => code
      .toUpperCase()
      .replaceAll(RegExp('[^A-Z0-9]'), '')
      .replaceAll('O', '0')
      .replaceAll('I', '1')
      .replaceAll('L', '1');

  static String? _requiredLength(String? value, String label, int min, int max) {
    final v = value?.trim() ?? '';
    if (v.isEmpty) return 'Bitte gib einen $label ein.';
    if (v.length < min) return 'Mindestens $min Zeichen.';
    if (v.length > max) return 'Höchstens $max Zeichen.';
    return null;
  }
}
