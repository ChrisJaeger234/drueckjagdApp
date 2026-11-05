import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FakeGroups, FakeHunts, FakeProfiles } from '../../test/fakes';
import { renderApp, signedIn } from '../../test/renderApp';
import { nextPhase, type Phase } from './huntModel';

function setup(role: 'owner' | 'member' = 'owner') {
  const auth = signedIn();
  const me = auth.user!.id;
  const profiles = new FakeProfiles();
  profiles.seed(me, { displayName: 'Max', username: 'max' });
  profiles.seed('u-anna', { displayName: 'Anna', username: 'anna' });
  const groups = new FakeGroups(auth, profiles);
  const groupId = groups.seedGroup('Hegering', [
    [me, role],
    ['u-anna', role === 'owner' ? 'member' : 'owner'],
  ]);
  const hunts = new FakeHunts(auth, groups, profiles);
  const huntId = hunts.seedHunt(groupId, { status: 'laufend' });
  const s1 = hunts.seedStand(huntId, 'Stand 1');
  const s2 = hunts.seedStand(huntId, 'Stand 2');
  hunts.seedParticipant(huntId, me, role === 'owner' ? 'jagdleiter' : 'schuetze', role === 'owner' ? null : s1);
  hunts.seedParticipant(huntId, 'u-anna', 'schuetze', s1);
  return { auth, profiles, groups, hunts, huntId, s1, s2, me };
}

describe('Phasen', () => {
  it('findet die nächste Phase', () => {
    const p = (id: string, sortOrder: number): Phase => ({ id, huntId: 'h', name: id, sortOrder });
    const list = [p('b', 2), p('a', 1), p('c', 3)];
    expect(nextPhase(list, null)?.id).toBe('a');
    expect(nextPhase(list, 'a')?.id).toBe('b');
    expect(nextPhase(list, 'c')).toBeNull();
  });

  it('plant Phase 2 voraus und schaltet um', async () => {
    const s = setup();
    renderApp(`/jagd/${s.huntId}`, s);
    await userEvent.click(await screen.findByRole('button', { name: 'Phasen nutzen' }));
    expect(await screen.findByText('Aktiv: Phase 1 (1 von 1)')).toBeInTheDocument();
    const anna = s.hunts.participantList.find((p) => p.userId === 'u-anna')!;
    // Phase 1 übernimmt die jetzige Zuteilung.
    expect(s.hunts.assignmentList).toEqual([expect.objectContaining({ participantId: anna.id, standId: s.s1 })]);

    await userEvent.click(screen.getByRole('button', { name: 'Phase hinzufügen' }));
    const plan = await screen.findByRole('list', { name: 'Zuteilung Phase 2' });
    expect(within(plan).getByLabelText('Stand von Anna in Phase 2')).toHaveValue(s.s1);
    await userEvent.selectOptions(within(plan).getByLabelText('Stand von Anna in Phase 2'), s.s2);
    await waitFor(() => expect(s.hunts.assignmentList.find((a) => a.participantId === anna.id && a.phaseId !== s.hunts.phaseList[0]!.id)?.standId).toBe(s.s2));
    // Aktive Phase bleibt unverändert, bis umgeschaltet wird.
    expect(anna.standId).toBe(s.s1);

    await userEvent.click(screen.getByRole('button', { name: 'Weiter zu Phase 2' }));
    expect(await screen.findByText('Aktiv: Phase 2 (2 von 2)')).toBeInTheDocument();
    expect(anna.standId).toBe(s.s2);
    expect(within(screen.getByRole('list', { name: 'Stände' })).getByLabelText('Schütze für Stand 2')).toHaveValue(anna.id);

    // Zurück zu Phase 1.
    await userEvent.click(within(screen.getByRole('list', { name: 'Phasen' })).getByRole('button', { name: 'Aktivieren' }));
    expect(await screen.findByText('Aktiv: Phase 1 (1 von 2)')).toBeInTheDocument();
    expect(anna.standId).toBe(s.s1);
  });

  it('zeigt Schützen die aktive Phase ohne Leitungsknöpfe', async () => {
    const s = setup('member');
    const phase: Phase = { id: 'ph-1', huntId: s.huntId, name: 'Phase 1', sortOrder: 1 };
    s.hunts.phaseList.push(phase);
    s.hunts.hunts[0]!.currentPhaseId = phase.id;
    renderApp(`/jagd/${s.huntId}`, s);
    expect(await screen.findByText('Aktiv: Phase 1 (1 von 1)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Phase hinzufügen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Weiter zu/ })).not.toBeInTheDocument();
  });
});
