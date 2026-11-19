import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FakeGroups, FakeHunts, FakeProfiles } from '../../test/fakes';
import { renderApp, signedIn } from '../../test/renderApp';
import { hidesStandNames, zoneIdsOf, type Zone } from './huntModel';

const square = { type: 'Polygon' as const, coordinates: [[[7.24, 51.16], [7.25, 51.16], [7.25, 51.17], [7.24, 51.16]]] };

function setup(role: 'owner' | 'member' = 'owner') {
  const auth = signedIn();
  const me = auth.user!.id;
  const profiles = new FakeProfiles();
  profiles.seed(me, { displayName: 'Max', username: 'max' });
  profiles.seed('u-tom', { displayName: 'Tom', username: 'tom' });
  const groups = new FakeGroups(auth, profiles);
  const groupId = groups.seedGroup('Hegering', [
    [me, role],
    ['u-tom', role === 'owner' ? 'member' : 'owner'],
  ]);
  const hunts = new FakeHunts(auth, groups, profiles);
  const huntId = hunts.seedHunt(groupId);
  const zone = (id: string, name: string): Zone => ({ id, huntId, name, kind: 'treiben', description: '', color: null, geometry: square });
  hunts.zoneList.push(zone('z-a', 'Treiben Eichenhang'), zone('z-b', 'Treiben Bach'), zone('z-c', 'Treiben Fichten'));
  if (role === 'owner') {
    hunts.seedParticipant(huntId, me, 'jagdleiter');
    hunts.seedParticipant(huntId, 'u-tom', 'treiber');
  } else {
    hunts.seedParticipant(huntId, 'u-tom', 'jagdleiter');
    hunts.seedParticipant(huntId, me, 'treiber');
  }
  return { auth, groups, profiles, hunts, huntId, me };
}

describe('Zonen für Treiber', () => {
  it('fasst erste und weitere Zonen zusammen', () => {
    const extras = [
      { id: 'e1', participantId: 'p1', zoneId: 'z-b', phaseId: null },
      { id: 'e2', participantId: 'p1', zoneId: 'z-c', phaseId: 'ph1' },
      { id: 'e3', participantId: 'p1', zoneId: 'z-gone', phaseId: null },
    ];
    expect(zoneIdsOf('z-a', extras, 'p1', null)).toEqual(['z-a', 'z-b', 'z-gone']);
    expect(zoneIdsOf('z-a', extras, 'p1', null, [{ id: 'z-a' }, { id: 'z-b' }])).toEqual(['z-a', 'z-b']);
    expect(zoneIdsOf(null, extras, 'p1', 'ph1')).toEqual(['z-c']);
    expect(hidesStandNames('treiber')).toBe(true);
    expect(hidesStandNames('schuetze')).toBe(false);
  });

  it('Jagdleiter teilt einem Treiber zwei Zonen zu', async () => {
    const s = setup();
    renderApp(`/jagd/${s.huntId}`, s);
    const list = await screen.findByRole('list', { name: 'Teilnehmer' });
    const picker = await within(list).findByRole('group', { name: 'Zone von Tom' });
    await userEvent.click(within(picker).getByRole('checkbox', { name: /Treiben Eichenhang/ }));
    const tom = s.hunts.participantList.find((p) => p.userId === 'u-tom')!;
    await waitFor(() => expect(tom.zoneId).toBe('z-a'));
    await userEvent.click(within(picker).getByRole('checkbox', { name: /Treiben Bach/ }));
    await waitFor(() => expect(s.hunts.extraZoneList).toEqual([expect.objectContaining({ participantId: tom.id, zoneId: 'z-b', phaseId: null })]));

    // Erste Zone abwählen: die weitere rückt nach.
    await userEvent.click(within(picker).getByRole('checkbox', { name: /Treiben Eichenhang/ }));
    await waitFor(() => expect(tom.zoneId).toBe('z-b'));
    await waitFor(() => expect(s.hunts.extraZoneList).toEqual([]));
  });

  it('Treiber sieht seine Zonen', async () => {
    const s = setup('member');
    const me = s.hunts.participantList.find((p) => p.userId === s.me)!;
    me.zoneId = 'z-a';
    s.hunts.extraZoneList.push({ id: 'e1', huntId: s.huntId, participantId: me.id, zoneId: 'z-c', phaseId: null });
    renderApp(`/jagd/${s.huntId}`, s);
    const mine = await screen.findByRole('list', { name: 'Meine Zonen' });
    expect(within(mine).getByText('Treiben Eichenhang')).toBeInTheDocument();
    expect(within(mine).getByText('Treiben Fichten')).toBeInTheDocument();
    expect(within(mine).queryByText('Treiben Bach')).not.toBeInTheDocument();
    // Legende unter der Karte: eigene Rolle und Zonen, eigene Zonen zuerst.
    expect(screen.getByTestId('legend-me')).toHaveTextContent('Du bist Treiber · Zonen: Treiben Eichenhang, Treiben Fichten');
    const legend = within(screen.getByRole('list', { name: 'Legende' })).getAllByRole('listitem');
    expect(legend.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Treiben Eichenhang'),
      expect.stringContaining('Treiben Fichten'),
      expect.stringContaining('Treiben Bach'),
    ]);
    expect(legend[0]).toHaveTextContent('deine Zone');
    expect(legend[2]).not.toHaveTextContent('deine Zone');
    // Ohne Leitungsrechte keine Farbwahl.
    expect(screen.queryByRole('button', { name: 'Farbe von Treiben Bach ändern' })).not.toBeInTheDocument();
  });

  it('ohne Migration 0018 bleibt es bei einer Zone', async () => {
    const s = setup();
    s.hunts.extraZonesMissing = true;
    renderApp(`/jagd/${s.huntId}`, s);
    const list = await screen.findByRole('list', { name: 'Teilnehmer' });
    await userEvent.selectOptions(await within(list).findByRole('combobox', { name: 'Zone von Tom' }), 'z-b');
    await waitFor(() => expect(s.hunts.participantList.find((p) => p.userId === 'u-tom')!.zoneId).toBe('z-b'));
  });

  it('weitere Zonen gelten je Phase und wandern in neue Phasen mit', async () => {
    const s = setup();
    const tom = s.hunts.participantList.find((p) => p.userId === 'u-tom')!;
    tom.zoneId = 'z-a';
    s.hunts.extraZoneList.push({ id: 'e1', huntId: s.huntId, participantId: tom.id, zoneId: 'z-b', phaseId: null });
    renderApp(`/jagd/${s.huntId}`, s);
    await userEvent.click(await screen.findByRole('button', { name: 'Phasen nutzen' }));
    await waitFor(() => expect(s.hunts.phaseList).toHaveLength(1));
    const phase1 = s.hunts.phaseList[0]!.id;
    await waitFor(() => expect(s.hunts.extraZoneList.filter((e) => e.phaseId === phase1)).toEqual([expect.objectContaining({ zoneId: 'z-b' })]));

    await userEvent.click(screen.getByRole('button', { name: 'Phase hinzufügen' }));
    const plan = await screen.findByRole('list', { name: 'Zuteilung Phase 2' });
    const picker = within(plan).getByRole('group', { name: 'Zone von Tom in Phase 2' });
    await waitFor(() => expect(within(picker).getByRole('checkbox', { name: /Treiben Bach/ })).toBeChecked());
    await userEvent.click(within(picker).getByRole('checkbox', { name: /Treiben Fichten/ }));
    const phase2 = s.hunts.phaseList.find((p) => p.id !== phase1)!.id;
    await waitFor(() => expect(s.hunts.extraZoneList.filter((e) => e.phaseId === phase2).map((e) => e.zoneId).sort()).toEqual(['z-b', 'z-c']));
    // Phase 1 bleibt unverändert.
    expect(s.hunts.extraZoneList.filter((e) => e.phaseId === phase1).map((e) => e.zoneId)).toEqual(['z-b']);
  });

  it('Jagdleiter gibt einer Zone eine eigene Farbe und setzt sie zurück', async () => {
    const s = setup();
    renderApp(`/jagd/${s.huntId}`, s);
    await userEvent.click(await screen.findByRole('button', { name: 'Farbe von Treiben Bach ändern' }));
    const colors = screen.getByRole('group', { name: 'Farbe für Treiben Bach' });
    await userEvent.click(within(colors).getByRole('button', { name: 'Farbe #5e35b1' }));
    await waitFor(() => expect(s.hunts.zoneList.find((z) => z.id === 'z-b')!.color).toBe('#5e35b1'));
    // Andere Zone derselben Art bleibt bei der Art-Farbe.
    expect(s.hunts.zoneList.find((z) => z.id === 'z-a')!.color).toBeNull();
    await userEvent.click(within(colors).getByRole('button', { name: 'Wie Art' }));
    await waitFor(() => expect(s.hunts.zoneList.find((z) => z.id === 'z-b')!.color).toBeNull());

    // Eigene Farbe wird ohne Verlassen des Feldes gespeichert (Handy), nur der letzte Wert.
    const own = within(screen.getByRole('group', { name: 'Farbe für Treiben Bach' })).getByLabelText('Eigene Farbe für Treiben Bach');
    fireEvent.change(own, { target: { value: '#123456' } });
    fireEvent.change(own, { target: { value: '#abcdef' } });
    await waitFor(() => expect(s.hunts.zoneList.find((z) => z.id === 'z-b')!.color).toBe('#abcdef'));
  });
});
