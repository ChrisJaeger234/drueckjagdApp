import { describe, expect, it } from 'vitest';
import { authRedirect } from './authRedirect';

describe('authRedirect', () => {
  it('wartet während der Initialisierung', () => {
    expect(authRedirect('initializing', '/karte')).toBeNull();
  });

  it('schickt Abgemeldete zur Anmeldung und lässt öffentliche Seiten zu', () => {
    expect(authRedirect('signedOut', '/')).toBe('/anmelden');
    expect(authRedirect('signedOut', '/profil')).toBe('/anmelden');
    expect(authRedirect('signedOut', '/registrieren')).toBeNull();
    expect(authRedirect('signedOut', '/passwort-vergessen/')).toBeNull();
  });

  it('schickt Angemeldete von den Anmeldeseiten zur Übersicht', () => {
    expect(authRedirect('signedIn', '/anmelden')).toBe('/');
    expect(authRedirect('signedIn', '/karte')).toBeNull();
  });

  it('erlaubt die Seite für ein neues Passwort immer', () => {
    expect(authRedirect('signedIn', '/passwort-neu')).toBeNull();
    expect(authRedirect('signedOut', '/passwort-neu')).toBeNull();
  });
});
