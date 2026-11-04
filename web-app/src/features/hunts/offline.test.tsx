import { onlineManager } from '@tanstack/react-query';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeGroups, FakeHunts, FakeProfiles } from '../../test/fakes';
import { renderApp, signedIn } from '../../test/renderApp';
import { newReport } from './huntModel';

function setup() {
  const auth = signedIn();
  const me = auth.user!.id;
  const profiles = new FakeProfiles();
  profiles.seed(me, { displayName: 'Max', username: 'max' });
  const groups = new FakeGroups(auth, profiles);
  const groupId = groups.seedGroup('Hegering', [[me, 'member']]);
  const hunts = new FakeHunts(auth, groups, profiles);
  const huntId = hunts.seedHunt(groupId, { status: 'laufend' });
  const standId = hunts.seedStand(huntId, 'Stand 7');
  hunts.seedParticipant(huntId, me, 'schuetze', standId);
  return { auth, profiles, groups, hunts, huntId };
}

afterEach(() => onlineManager.setOnline(true));

describe('Meldungen im Funkloch', () => {
  it('speichert die Meldung ohne Netz und sendet sie, sobald wieder Netz da ist', async () => {
    const s = setup();
    renderApp(`/jagd/${s.huntId}`, s);
    await screen.findByText('Dein Stand: Stand 7');
    act(() => onlineManager.setOnline(false));
    await userEvent.click(screen.getByRole('button', { name: 'Angeschossen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Rehwild' }));
    await userEvent.click(screen.getByRole('button', { name: 'Angeschossen melden' }));
    expect(screen.getByText(/Kein Netz: Meldung „Angeschossen“ ist gespeichert/)).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Meldungen' });
    expect(within(list).getByText('Wartet auf Netz')).toBeInTheDocument();
    expect(within(list).getByText('Angeschossen: Rehwild')).toBeInTheDocument();
    expect(s.hunts.reportList).toHaveLength(0);

    act(() => onlineManager.setOnline(true));
    expect(await within(list).findByText('Nachsuche offen')).toBeInTheDocument();
    expect(within(list).queryByText('Wartet auf Netz')).not.toBeInTheDocument();
    expect(s.hunts.reportList).toHaveLength(1);
    expect(s.hunts.reportList[0]).toMatchObject({ kind: 'angeschossen', species: 'Rehwild' });
  });

  it('erzeugt bei wiederholter Übertragung keine Dublette', async () => {
    const s = setup();
    const input = newReport({ kind: 'erlegt', species: 'Fuchs', count: 1, standId: null, lat: null, lng: null, note: '' });
    await s.hunts.createReport(s.huntId, input);
    await s.hunts.createReport(s.huntId, input);
    expect(s.hunts.reportList).toHaveLength(1);
    expect(input.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
