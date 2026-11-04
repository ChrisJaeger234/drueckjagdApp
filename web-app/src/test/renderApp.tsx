import { createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { App, createQueryClient } from '../app/App';
import { createAppRouter } from '../app/router';
import { FakeAuth, FakeChat, FakeGroups, FakeHunts, FakeProfiles, FakeReviere } from './fakes';

export function renderApp(
  path: string,
  { auth = new FakeAuth(), profiles = new FakeProfiles(), groups, reviere, hunts, chat }: { auth?: FakeAuth; profiles?: FakeProfiles; groups?: FakeGroups; reviere?: FakeReviere; hunts?: FakeHunts; chat?: FakeChat } = {},
) {
  const groupsService = groups ?? new FakeGroups(auth, profiles);
  const reviereService = reviere ?? new FakeReviere(auth, groupsService);
  const huntsService = hunts ?? new FakeHunts(auth, groupsService, profiles);
  const chatService = chat ?? new FakeChat(auth, groupsService, profiles);
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [path] }) });
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false, networkMode: 'always' }, mutations: { networkMode: 'always' } });
  const view = render(<App router={router} services={{ auth, profiles, groups: groupsService, reviere: reviereService, hunts: huntsService, chat: chatService }} queryClient={queryClient} />);
  return { ...view, router, auth, profiles, groups: groupsService, reviere: reviereService, hunts: huntsService, chat: chatService };
}

export const signedIn = (email = 'max@revier.de') => new FakeAuth({ id: `u-${email}`, email, emailConfirmed: true });
