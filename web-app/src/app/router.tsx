import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { ChatPage } from '../features/chat/ChatPage';
import { GroupsPage } from '../features/groups/GroupsPage';
import { MapPage } from '../features/map/MapPage';
import { OverviewPage } from '../features/overview/OverviewPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { AppShell } from './AppShell';
import { NotFound } from './NotFound';

const rootRoute = createRootRoute({ component: AppShell, notFoundComponent: NotFound });

export const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: OverviewPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/karte', component: MapPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/gruppe', component: GroupsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/chat', component: ChatPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/profil', component: ProfilePage }),
]);

export function createAppRouter(options: { basepath?: string; history?: Parameters<typeof createRouter>[0]['history'] } = {}) {
  return createRouter({ routeTree, basepath: options.basepath, history: options.history, defaultPreload: 'intent' });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
