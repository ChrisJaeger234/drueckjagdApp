export type AuthStatus = 'initializing' | 'signedOut' | 'signedIn';

/** Seiten ohne Anmeldung. */
export const PUBLIC_PATHS = ['/anmelden', '/registrieren', '/passwort-vergessen'];
/** Seiten, die in beiden Zuständen erreichbar sind (Link aus der Passwort-Mail). */
export const ANY_PATHS = ['/passwort-neu'];

/**
 * Weiterleitungslogik als reine Funktion (Port von auth_redirect.dart):
 * nicht angemeldet → nur öffentliche Seiten; angemeldet → keine Anmeldeseiten.
 * Liefert das Ziel oder `null`, wenn die Seite bleiben darf.
 */
export function authRedirect(status: AuthStatus, path: string): string | null {
  const normalized = path.length > 1 ? path.replace(/\/+$/, '') : path;
  if (status === 'initializing' || ANY_PATHS.includes(normalized)) return null;
  if (status === 'signedOut') return PUBLIC_PATHS.includes(normalized) ? null : '/anmelden';
  return PUBLIC_PATHS.includes(normalized) ? '/' : null;
}
