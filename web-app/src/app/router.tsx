import { createRootRoute, createRoute, createRouter, type RouterHistory } from '@tanstack/react-router';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { LoginPage } from '../features/auth/LoginPage';
import { NewPasswordPage } from '../features/auth/NewPasswordPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { ChatPage } from '../features/chat/ChatPage';
import { CreateGroupPage } from '../features/groups/CreateGroupPage';
import { GroupDetailPage } from '../features/groups/GroupDetailPage';
import { GroupsPage } from '../features/groups/GroupsPage';
import { CreateHuntPage, EditHuntPage } from '../features/hunts/HuntFormPage';
import { HuntPage } from '../features/hunts/HuntPage';
import { JoinGroupPage } from '../features/groups/JoinGroupPage';
import { MapPage } from '../features/map/MapPage';
import { OverviewPage } from '../features/overview/OverviewPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { CreateRevierPage, EditRevierPage } from '../features/reviere/RevierFormPage';
import { RevierPage } from '../features/reviere/RevierPage';
import { AppShell } from './AppShell';
import { AuthGate } from './AuthGate';
import { NotFound } from './NotFound';

const rootRoute = createRootRoute({ component: AuthGate, notFoundComponent: NotFound });

// Bereiche mit Hauptnavigation (nur angemeldet, siehe AuthGate).
const shellRoute = createRoute({ getParentRoute: () => rootRoute, id: 'shell', component: AppShell });
const inShell = <P extends string>(path: P, component: () => React.JSX.Element) => createRoute({ getParentRoute: () => shellRoute, path, component });

const authRoute = <P extends string>(path: P, component: () => React.JSX.Element) => createRoute({ getParentRoute: () => rootRoute, path, component });

export const routeTree = rootRoute.addChildren([
  shellRoute.addChildren([
    inShell('/', OverviewPage),
    inShell('/karte', MapPage),
    inShell('/gruppe', GroupsPage),
    inShell('/gruppe/neu', CreateGroupPage),
    inShell('/gruppe/beitreten', JoinGroupPage),
    inShell('/gruppe/$groupId', GroupDetailPage),
    inShell('/gruppe/$groupId/revier-neu', CreateRevierPage),
    inShell('/revier/$revierId', RevierPage),
    inShell('/gruppe/$groupId/jagd-neu', CreateHuntPage),
    inShell('/jagd/$huntId', HuntPage),
    inShell('/jagd/$huntId/bearbeiten', EditHuntPage),
    inShell('/revier/$revierId/bearbeiten', EditRevierPage),
    inShell('/chat', ChatPage),
    inShell('/profil', ProfilePage),
  ]),
  authRoute('/anmelden', LoginPage),
  authRoute('/registrieren', RegisterPage),
  authRoute('/passwort-vergessen', ForgotPasswordPage),
  authRoute('/passwort-neu', NewPasswordPage),
]);

export function createAppRouter(options: { basepath?: string; history?: RouterHistory } = {}) {
  return createRouter({ routeTree, basepath: options.basepath, history: options.history, defaultPreload: 'intent' });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
