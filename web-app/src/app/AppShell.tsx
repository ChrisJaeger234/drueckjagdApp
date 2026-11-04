import { Link, Outlet } from '@tanstack/react-router';
import { LayoutDashboard, Map, MessagesSquare, User, Users, type LucideIcon } from 'lucide-react';
import { LiveSharing } from '../features/live/LiveSharing';
import { OfflineBanner } from './OfflineBanner';

/** Hauptbereiche wie in der Flutter-App (lib/app/router/app_shell.dart). */
export const destinations: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/', label: 'Übersicht', icon: LayoutDashboard },
  { to: '/karte', label: 'Karte', icon: Map },
  { to: '/gruppe', label: 'Gruppe', icon: Users },
  { to: '/chat', label: 'Chat', icon: MessagesSquare },
  { to: '/profil', label: 'Profil', icon: User },
];

/**
 * Smartphone: Navigationsleiste unten (Daumenreichweite).
 * Tablet und Desktop ab 768 px: Leiste links, Inhalt daneben.
 */
export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <nav
        aria-label="Hauptnavigation"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:sticky md:top-0 md:h-dvh md:w-56 md:border-r md:border-t-0 md:pb-0"
      >
        <div className="hidden px-5 pb-4 pt-6 md:block">
          <span className="text-lg font-semibold text-primary">Drückjagd</span>
        </div>
        <ul className="grid grid-cols-5 md:flex md:flex-col md:gap-1 md:px-3">
          {destinations.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                activeOptions={{ exact: to === '/' }}
                className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted md:min-h-11 md:flex-row md:justify-start md:gap-3 md:rounded-xl md:px-3 md:text-sm"
                activeProps={{ className: 'text-primary md:bg-sand-light/60', 'aria-current': 'page' }}
              >
                <Icon aria-hidden className="size-6 md:size-5" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main className="flex-1 pb-[calc(env(safe-area-inset-bottom)+72px)] md:pb-0">
        <OfflineBanner />
        <LiveSharing />
        <Outlet />
      </main>
    </div>
  );
}
