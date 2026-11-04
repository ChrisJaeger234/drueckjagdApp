import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthStatus } from './authRedirect';
import type { AppUser, AuthService } from './authService';

interface AuthState {
  status: AuthStatus;
  user: AppUser | null;
  /** `true`, nachdem der Link aus der Passwort-Mail geöffnet wurde. */
  recovery: boolean;
  service: AuthService;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ service, children }: { service: AuthService; children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('initializing');
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    let active = true;
    const unsubscribe = service.onChange((next, event) => {
      if (!active) return;
      setUser(next);
      setStatus(next ? 'signedIn' : 'signedOut');
      if (event === 'passwordRecovery') setRecovery(true);
      if (event === 'signedOut') setRecovery(false);
    });
    // Falls kein Startereignis kommt (z. B. in Tests), den aktuellen Stand selbst holen.
    service
      .currentUser()
      .then((current) => {
        if (!active) return;
        setUser((prev) => prev ?? current);
        setStatus((prev) => (prev === 'initializing' ? (current ? 'signedIn' : 'signedOut') : prev));
      })
      .catch(() => active && setStatus((prev) => (prev === 'initializing' ? 'signedOut' : prev)));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [service]);

  const value = useMemo(() => ({ status, user, recovery, service }), [status, user, recovery, service]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth außerhalb von AuthProvider');
  return ctx;
}

/** Angemeldeter Benutzer; nur innerhalb geschützter Seiten verwenden. */
export function useUser(): AppUser {
  const { user } = useAuth();
  if (!user) throw new Error('Kein angemeldeter Benutzer');
  return user;
}
