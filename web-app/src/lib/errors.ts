// Übersetzt technische Fehler (Supabase, Netzwerk, …) zentral in AppError mit deutschen
// Meldungen. Port von lib/core/errors/error_mapper.dart, gleiche Texte und Fälle.

export type AppErrorKind =
  | 'network'
  | 'invalidCredentials'
  | 'emailNotConfirmed'
  | 'emailAlreadyRegistered'
  | 'weakPassword'
  | 'rateLimited'
  | 'unauthenticated'
  | 'forbidden'
  | 'notFound'
  | 'conflict'
  | 'validation'
  | 'unknown';

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly cause?: unknown;

  constructor(message: string, kind: AppErrorKind = 'unknown', cause?: unknown) {
    super(message);
    this.name = 'AppError';
    this.kind = kind;
    this.cause = cause;
  }
}

const NETWORK = 'Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.';
const SESSION_EXPIRED = 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.';

/** Fehlerschlüssel aus den SQL-Funktionen (Migrationen 0004, 0009, 0010). */
const RPC_MESSAGES: Record<string, [string, AppErrorKind]> = {
  not_authenticated: ['Bitte melde dich an.', 'unauthenticated'],
  not_authorized: ['Dafür fehlen dir die Berechtigungen in dieser Gruppe.', 'forbidden'],
  too_many_attempts: ['Zu viele ungültige Einladungscodes. Bitte versuche es in 15 Minuten erneut.', 'rateLimited'],
  last_owner: [
    'Du bist der einzige Owner. Ernenne zuerst ein anderes Mitglied zum Owner oder lösche die Gruppe.',
    'conflict',
  ],
  member_not_found: ['Dieses Mitglied wurde nicht gefunden.', 'notFound'],
  use_leave_group: ['Um dich selbst zu entfernen, verlasse die Gruppe.', 'validation'],
  invalid_validity: ['Die Gültigkeitsdauer ist ungültig (1 Stunde bis 90 Tage).', 'validation'],
  invalid_max_uses: ['Die maximale Anzahl an Nutzungen ist ungültig (1–500).', 'validation'],
  invalid_boundary: [
    'Die Fläche ist ungültig. Bitte zeichne ein geschlossenes Polygon oder importiere eine gültige Datei.',
    'validation',
  ],
  not_a_group_member: ['Diese Person ist kein Mitglied der Gruppe.', 'validation'],
  waypoint_not_in_group: ['Diese Einrichtung gehört nicht zu einem Revier der Gruppe.', 'validation'],
};

interface AuthLike {
  name?: string;
  message: string;
  code?: string;
  status?: number;
  __isAuthError?: boolean;
}

interface PostgrestLike {
  message: string;
  code: string;
  details?: string | null;
  hint?: string | null;
}

function isAuthError(e: unknown): e is AuthLike {
  return typeof e === 'object' && e !== null && ((e as AuthLike).__isAuthError === true || /^Auth\w*Error$/.test((e as AuthLike).name ?? ''));
}

function isPostgrestError(e: unknown): e is PostgrestLike {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as PostgrestLike).code === 'string' &&
    typeof (e as PostgrestLike).message === 'string' &&
    'details' in e
  );
}

function isNetworkError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return (
    (e.name === 'TypeError' && /fetch|network|load failed/i.test(e.message)) ||
    e.name === 'AbortError' ||
    /Failed to fetch|NetworkError|Load failed/i.test(e.message)
  );
}

function mapAuth(e: AuthLike): AppError {
  const code = e.code ?? '';
  const message = e.message.toLowerCase();
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return new AppError('E-Mail-Adresse oder Passwort ist falsch.', 'invalidCredentials', e);
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return new AppError(
      'Bitte bestätige zuerst deine E-Mail-Adresse über den Link in der Bestätigungs-Mail.',
      'emailNotConfirmed',
      e,
    );
  }
  if (code === 'user_already_exists' || code === 'email_exists' || message.includes('already registered')) {
    return new AppError('Für diese E-Mail-Adresse existiert bereits ein Konto.', 'emailAlreadyRegistered', e);
  }
  if (code === 'weak_password' || e.name === 'AuthWeakPasswordError') {
    return new AppError('Das Passwort ist zu schwach. Bitte wähle ein längeres Passwort.', 'weakPassword', e);
  }
  if (code === 'same_password') {
    return new AppError('Das neue Passwort muss sich vom bisherigen unterscheiden.', 'validation', e);
  }
  if (code.startsWith('over_') || e.status === 429) {
    return new AppError('Zu viele Versuche. Bitte warte einen Moment und versuche es erneut.', 'rateLimited', e);
  }
  if (code === 'session_not_found' || code === 'refresh_token_not_found' || e.name === 'AuthSessionMissingError') {
    return new AppError(SESSION_EXPIRED, 'unauthenticated', e);
  }
  if (e.name === 'AuthRetryableFetchError') {
    return new AppError(NETWORK, 'network', e);
  }
  return new AppError(`Anmeldung fehlgeschlagen: ${e.message}`, 'unknown', e);
}

function mapPostgrest(e: PostgrestLike): AppError {
  const rpc = RPC_MESSAGES[e.message];
  if (rpc) return new AppError(rpc[0], rpc[1], e);
  switch (e.code) {
    case '23505':
      if (e.message.includes('profiles_username_key')) return new AppError('Dieser Benutzername ist bereits vergeben.', 'conflict', e);
      if (e.message.includes('reviere_group_name_key')) {
        return new AppError('In dieser Gruppe gibt es bereits ein Revier mit diesem Namen.', 'conflict', e);
      }
      if (e.message.includes('hunt_stands_label_key')) {
        return new AppError('In dieser Jagd gibt es bereits einen Stand mit dieser Bezeichnung.', 'conflict', e);
      }
      if (e.message.includes('hunt_participants_unique')) return new AppError('Diese Person ist bereits eingetragen.', 'conflict', e);
      return new AppError('Dieser Eintrag existiert bereits.', 'conflict', e);
    case '23514':
    case '22001':
      return new AppError('Die Eingabe ist ungültig.', 'validation', e);
    case '42501':
      return new AppError('Dafür fehlen dir die Berechtigungen.', 'forbidden', e);
    case 'PGRST116':
      return new AppError('Der Eintrag wurde nicht gefunden.', 'notFound', e);
    case 'PGRST301':
    case 'PGRST303':
      return new AppError(SESSION_EXPIRED, 'unauthenticated', e);
  }
  if (e.message && isNetworkError(new Error(e.message))) return new AppError(NETWORK, 'network', e);
  return new AppError('Serverfehler. Bitte versuche es erneut.', 'unknown', e);
}

export function mapError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (isAuthError(error)) return mapAuth(error);
  if (isPostgrestError(error)) return mapPostgrest(error);
  if (isNetworkError(error)) return new AppError(NETWORK, 'network', error);
  if (typeof error === 'object' && error !== null && (error as { name?: string }).name === 'StorageApiError') {
    return new AppError('Die Datei konnte nicht verarbeitet werden.', 'unknown', error);
  }
  return new AppError('Unerwarteter Fehler. Bitte versuche es erneut.', 'unknown', error);
}

/** Führt `action` aus und wirft Fehler einheitlich als AppError. */
export async function guard<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (e) {
    throw mapError(e);
  }
}

type SuccessData<R> = Extract<R, { error: null }> extends { data: infer D } ? D : never;

/** Wirft `error` aus einer Supabase-Antwort `{ data, error }` als AppError, sonst `data`. */
export function unwrap<R extends { data: unknown; error: unknown }>(res: R): SuccessData<R> {
  if (res.error) throw mapError(res.error);
  return res.data as SuccessData<R>;
}

/** Wie `unwrap`, für Antworten ohne Daten (`{ error }`). */
export function check(res: { error: unknown }): void {
  if (res.error) throw mapError(res.error);
}
