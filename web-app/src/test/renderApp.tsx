import { createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { App, createQueryClient } from '../app/App';
import { createAppRouter } from '../app/router';
import { FakeAuth, FakeGroups, FakeProfiles } from './fakes';

export function renderApp(
  path: string,
  { auth = new FakeAuth(), profiles = new FakeProfiles(), groups }: { auth?: FakeAuth; profiles?: FakeProfiles; groups?: FakeGroups } = {},
) {
  const groupsService = groups ?? new FakeGroups(auth, profiles);
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [path] }) });
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false, networkMode: 'always' }, mutations: { networkMode: 'always' } });
  const view = render(<App router={router} services={{ auth, profiles, groups: groupsService }} queryClient={queryClient} />);
  return { ...view, router, auth, profiles, groups: groupsService };
}

export const signedIn = (email = 'max@revier.de') => new FakeAuth({ id: `u-${email}`, email, emailConfirmed: true });
