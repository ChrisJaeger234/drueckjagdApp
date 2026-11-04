import 'package:drueckjagd_app/core/utils/validators.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('E-Mail', () {
    test('akzeptiert gültige Adressen', () {
      expect(Validators.email('jaeger@revier.de'), isNull);
      expect(Validators.email('  max.mustermann+jagd@example.co.uk '), isNull);
    });
    test('lehnt ungültige Adressen ab', () {
      expect(Validators.email(''), isNotNull);
      expect(Validators.email('jaeger@'), isNotNull);
      expect(Validators.email('jaeger@revier'), isNotNull);
      expect(Validators.email('kein mail@x.de'), isNotNull);
    });
  });

  group('Passwort', () {
    test('mindestens 8 Zeichen mit Buchstaben und Ziffern', () {
      expect(Validators.password('waidmann1'), isNull);
      expect(Validators.password('kurz1'), contains('8 Zeichen'));
      expect(Validators.password('nurbuchstaben'), contains('Ziffern'));
      expect(Validators.password('12345678'), contains('Ziffern'));
      expect(Validators.password(''), isNotNull);
    });
    test('Bestätigung muss übereinstimmen', () {
      expect(Validators.passwordConfirmation('waidmann1', 'waidmann1'), isNull);
      expect(Validators.passwordConfirmation('waidmann2', 'waidmann1'), contains('nicht überein'));
      expect(Validators.passwordConfirmation('', 'waidmann1'), isNotNull);
    });
    test('Anmeldung verlangt nur eine Eingabe', () {
      expect(Validators.loginPassword('x'), isNull);
      expect(Validators.loginPassword(''), isNotNull);
    });
  });

  group('Benutzername', () {
    test('entspricht der Datenbankregel ^[a-z0-9_]{3,24}\$', () {
      expect(Validators.username('max_99'), isNull);
      expect(Validators.username('ab'), isNotNull);
      expect(Validators.username('Max'), isNotNull);
      expect(Validators.username('mäx'), isNotNull);
      expect(Validators.username('a' * 25), isNotNull);
    });
  });

  group('Namen', () {
    test('Gruppen- und Reviernamen', () {
      expect(Validators.groupName('Jagdfreunde'), isNull);
      expect(Validators.groupName(' a '), contains('Mindestens'));
      expect(Validators.groupName('x' * 81), contains('Höchstens'));
      expect(Validators.revierName('Nord'), isNull);
      expect(Validators.revierName(''), isNotNull);
    });
    test('maxLength', () {
      expect(Validators.maxLength(3)('abc'), isNull);
      expect(Validators.maxLength(3)('abcd'), isNotNull);
    });
  });

  group('Einladungscode', () {
    test('Normalisierung entspricht private.normalize_invite_code', () {
      expect(Validators.normalizeInviteCode('abcd-efgh-jkmn'), 'ABCDEFGHJKMN');
      expect(Validators.normalizeInviteCode('O0IL 1'), '00111');
    });
    test('Format wird geprüft', () {
      expect(Validators.inviteCode('ABCD-EFGH-JKMN'), isNull);
      expect(Validators.inviteCode('abcdefghjkmn'), isNull);
      expect(Validators.inviteCode('ABCD-EFGH'), isNotNull);
      expect(Validators.inviteCode('ABCD-EFGH-JKMU'), isNotNull, reason: 'U ist kein Crockford-Zeichen');
      expect(Validators.inviteCode(''), isNotNull);
    });
  });
}
