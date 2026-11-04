import { Navigate, Outlet, useRouterState } from '@tanstack/react-router';
import { useAuth } from '../features/auth/AuthContext';
import { authRedirect } from '../features/auth/authRedirect';

/** Leitet je nach Anmeldestatus weiter; zeigt während des Starts einen ruhigen Ladebildschirm. */
export function AuthGate() {
  const { status, recovery } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (status === 'initializing') {
    return (
      <div className="grid min-h-dvh place-items-center" role="status" aria-label="App wird gestartet">
        <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" className="size-16 animate-pulse rounded-2xl" />
      </div>
    );
  }
  // Link aus der Passwort-Mail: zuerst das neue Passwort setzen lassen.
  if (recovery && path !== '/passwort-neu') return <Navigate to="/passwort-neu" replace />;
  const target = authRedirect(status, path);
  if (target) return <Navigate to={target} replace />;
  return <Outlet />;
}
