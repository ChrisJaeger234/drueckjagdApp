// Eingabeprüfung, Port von lib/core/utils/validators.dart.
// Jede Funktion liefert `undefined` bei gültiger Eingabe, sonst eine deutsche Fehlermeldung.

export type Validator = (value: string) => string | undefined;

const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const USERNAME = /^[a-z0-9_]{3,24}$/;
const INVITE_ALPHABET = /^[0-9A-HJKMNP-TV-Z]{12}$/;

export const MIN_PASSWORD_LENGTH = 8;

export function email(value: string): string | undefined {
  const v = value.trim();
  if (!v) return 'Bitte gib deine E-Mail-Adresse ein.';
  if (!EMAIL.test(v)) return 'Bitte gib eine gültige E-Mail-Adresse ein.';
  return undefined;
}

export function password(value: string): string | undefined {
  if (!value) return 'Bitte gib ein Passwort ein.';
  if (value.length < MIN_PASSWORD_LENGTH) return `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`;
  if (!/[A-Za-zÄÖÜäöüß]/.test(value) || !/\d/.test(value)) return 'Das Passwort muss Buchstaben und Ziffern enthalten.';
  return undefined;
}

/** Für die Anmeldung reicht eine nicht-leere Eingabe. */
export function loginPassword(value: string): string | undefined {
  return value ? undefined : 'Bitte gib dein Passwort ein.';
}

export function passwordConfirmation(value: string, pw: string): string | undefined {
  if (!value) return 'Bitte bestätige dein Passwort.';
  if (value !== pw) return 'Die Passwörter stimmen nicht überein.';
  return undefined;
}

export function username(value: string): string | undefined {
  const v = value.trim();
  if (!v) return 'Bitte wähle einen Benutzernamen.';
  if (!USERNAME.test(v)) return '3–24 Zeichen, nur Kleinbuchstaben, Ziffern und Unterstrich.';
  return undefined;
}

export function displayName(value: string): string | undefined {
  const v = value.trim();
  if (!v) return 'Bitte gib einen Anzeigenamen ein.';
  if (v.length > 60) return 'Höchstens 60 Zeichen.';
  return undefined;
}

function requiredLength(value: string, label: string, min: number, max: number): string | undefined {
  const v = value.trim();
  if (!v) return `Bitte gib einen ${label} ein.`;
  if (v.length < min) return `Mindestens ${min} Zeichen.`;
  if (v.length > max) return `Höchstens ${max} Zeichen.`;
  return undefined;
}

export const groupName: Validator = (v) => requiredLength(v, 'Gruppennamen', 2, 80);
export const revierName: Validator = (v) => requiredLength(v, 'Reviernamen', 2, 120);
export const huntTitle: Validator = (v) => requiredLength(v, 'Titel', 2, 120);
export const standLabel: Validator = (v) => requiredLength(v, 'Standnamen', 1, 60);

export function maxLength(max: number): Validator {
  return (value) => (value.trim().length > max ? `Höchstens ${max} Zeichen.` : undefined);
}

/** Entspricht `private.normalize_invite_code` in der Datenbank. */
export function normalizeInviteCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

export function inviteCode(value: string): string | undefined {
  const normalized = normalizeInviteCode(value);
  if (!normalized) return 'Bitte gib einen Einladungscode ein.';
  if (!INVITE_ALPHABET.test(normalized)) return 'Der Code besteht aus 12 Zeichen, z. B. ABCD-EFGH-JKMN.';
  return undefined;
}
