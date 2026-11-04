import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FakeProfiles } from '../../test/fakes';
import { renderApp, signedIn } from '../../test/renderApp';
import { isProfileComplete, profileLabel } from './profileService';

describe('Profilregeln', () => {
  it('benennt und prüft Profile wie die Flutter-App', () => {
    expect(profileLabel({ displayName: ' Max ', username: 'max' })).toBe('Max');
    expect(profileLabel({ displayName: '', username: 'max' })).toBe('@max');
    expect(profileLabel({ displayName: '', username: null })).toBe('Unbenannt');
    expect(isProfileComplete({ displayName: 'Max', username: 'max' })).toBe(true);
    expect(isProfileComplete({ displayName: 'Max', username: null })).toBe(false);
  });
});

describe('Profilseite', () => {
  it('fordert bei unvollständigem Profil zum Ausfüllen auf und speichert', async () => {
    const auth = signedIn();
    const profiles = new FakeProfiles();
    renderApp('/profil', { auth, profiles });
    expect(await screen.findByText('Profil vervollständigen')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Anzeigename'), 'Max Jäger');
    await userEvent.type(screen.getByLabelText('Benutzername'), 'Max_Jaeger');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('@max_jaeger')).toBeInTheDocument();
    expect(profiles.profiles.get(auth.user!.id)).toMatchObject({ username: 'max_jaeger', displayName: 'Max Jäger' });
    expect(screen.queryByText('Profil vervollständigen')).not.toBeInTheDocument();
  });

  it('meldet einen vergebenen Benutzernamen', async () => {
    const profiles = new FakeProfiles();
    profiles.takenUsernames.add('max');
    renderApp('/profil', { auth: signedIn(), profiles });
    await userEvent.type(await screen.findByLabelText('Anzeigename'), 'Max');
    await userEvent.type(screen.getByLabelText('Benutzername'), 'max');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Dieser Benutzername ist bereits vergeben.');
  });

  it('meldet ab und zeigt wieder die Anmeldung', async () => {
    const auth = signedIn();
    const profiles = new FakeProfiles();
    profiles.seed(auth.user!.id, { username: 'max', displayName: 'Max' });
    renderApp('/profil', { auth, profiles });
    await userEvent.click(await screen.findByRole('button', { name: 'Abmelden' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Anmelden' })).toBeInTheDocument();
    expect(auth.calls).toContain('signOut');
  });
});
