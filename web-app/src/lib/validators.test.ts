import { describe, expect, it } from 'vitest';
import * as V from './validators';

// Gleiche Fälle wie test/unit/validators_test.dart der Flutter-App.
describe('Validators', () => {
  it('akzeptiert gültige E-Mail-Adressen', () => {
    expect(V.email('jaeger@revier.de')).toBeUndefined();
    expect(V.email('  max.mustermann+jagd@example.co.uk ')).toBeUndefined();
  });

  it('lehnt ungültige E-Mail-Adressen ab', () => {
    for (const v of ['', 'jaeger@', 'jaeger@revier', 'kein mail@x.de']) expect(V.email(v)).toBeDefined();
  });

  it('verlangt Passwörter mit mindestens 8 Zeichen, Buchstaben und Ziffern', () => {
    expect(V.password('waidmann1')).toBeUndefined();
    expect(V.password('kurz1')).toContain('8 Zeichen');
    expect(V.password('nurbuchstaben')).toContain('Ziffern');
    expect(V.password('12345678')).toContain('Ziffern');
    expect(V.password('')).toBeDefined();
  });

  it('prüft die Passwortbestätigung', () => {
    expect(V.passwordConfirmation('waidmann1', 'waidmann1')).toBeUndefined();
    expect(V.passwordConfirmation('waidmann2', 'waidmann1')).toContain('nicht überein');
    expect(V.passwordConfirmation('', 'waidmann1')).toBeDefined();
  });

  it('verlangt bei der Anmeldung nur eine Eingabe', () => {
    expect(V.loginPassword('x')).toBeUndefined();
    expect(V.loginPassword('')).toBeDefined();
  });

  it('prüft Benutzernamen wie die Datenbankregel ^[a-z0-9_]{3,24}$', () => {
    expect(V.username('max_99')).toBeUndefined();
    for (const v of ['ab', 'Max', 'mäx', 'a'.repeat(25)]) expect(V.username(v)).toBeDefined();
  });

  it('prüft Anzeigenamen', () => {
    expect(V.displayName('Max Jäger')).toBeUndefined();
    expect(V.displayName('  ')).toBeDefined();
    expect(V.displayName('x'.repeat(61))).toContain('60');
  });

  it('prüft Gruppen- und Reviernamen', () => {
    expect(V.groupName('Jagdfreunde')).toBeUndefined();
    expect(V.groupName(' a ')).toContain('Mindestens');
    expect(V.groupName('x'.repeat(81))).toContain('Höchstens');
    expect(V.revierName('Nord')).toBeUndefined();
    expect(V.revierName('')).toBeDefined();
  });

  it('normalisiert Einladungscodes wie private.normalize_invite_code', () => {
    expect(V.normalizeInviteCode('abcd-efgh-jkmn')).toBe('ABCDEFGHJKMN');
    expect(V.normalizeInviteCode('O0IL 1')).toBe('00111');
    expect(V.inviteCode('abcd-efgh-jkmn')).toBeUndefined();
    expect(V.inviteCode('abc')).toContain('12 Zeichen');
  });
});
