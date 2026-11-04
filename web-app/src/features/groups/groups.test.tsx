import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FakeGroups, FakeProfiles } from '../../test/fakes';
import { renderApp, signedIn } from '../../test/renderApp';
import { formatInviteCode, groupPermissions, inviteStatus, sortMembers, type GroupInvite, type GroupMember } from './groupModel';

const invite = (data: Partial<GroupInvite> = {}): GroupInvite => ({
  id: 'i',
  groupId: 'g',
  createdBy: null,
  createdAt: '2026-11-01T00:00:00Z',
  expiresAt: null,
  maxUses: null,
  useCount: 0,
  revokedAt: null,
  ...data,
});

describe('Gruppenregeln', () => {
  it('leitet Berechtigungen aus der Rolle ab (wie group_permissions.dart)', () => {
    const owner = groupPermissions('owner', false);
    expect(owner.canAssignRoles && owner.canDeleteGroup && owner.canInvite).toBe(true);
    expect(owner.canRemove('admin', false)).toBe(true);
    expect(owner.canRemove('owner', true)).toBe(false);

    expect(groupPermissions('admin', true).canInvite).toBe(true);
    expect(groupPermissions('admin', true).canRemove('member', false)).toBe(true);
    expect(groupPermissions('admin', true).canRemove('admin', false)).toBe(false);
    expect(groupPermissions('admin', false).canInvite).toBe(false);
    expect(groupPermissions('admin', true).canAssignRoles).toBe(false);

    const member = groupPermissions('member', true);
    expect(member.canInvite || member.canEditGroup || member.canRemove('member', false)).toBe(false);
  });

  it('bestimmt den Status einer Einladung', () => {
    const now = new Date('2026-11-04T12:00:00Z');
    expect(inviteStatus(invite(), now)).toBe('active');
    expect(inviteStatus(invite({ expiresAt: '2026-11-04T11:00:00Z' }), now)).toBe('expired');
    expect(inviteStatus(invite({ maxUses: 1, useCount: 1 }), now)).toBe('exhausted');
    expect(inviteStatus(invite({ revokedAt: '2026-11-02T00:00:00Z', maxUses: 1, useCount: 1 }), now)).toBe('revoked');
  });

  it('formatiert Codes und sortiert Mitglieder nach Rolle und Name', () => {
    expect(formatInviteCode('ABCDEFGHJKMN')).toBe('ABCD-EFGH-JKMN');
    const m = (userId: string, role: GroupMember['role'], displayName: string): GroupMember => ({
      id: userId,
      groupId: 'g',
      userId,
      role,
      joinedAt: '',
      profile: { id: userId, username: null, displayName, avatarPath: null, createdAt: '', updatedAt: '' },
    });
    const sorted = sortMembers([m('1', 'member', 'Zora'), m('2', 'member', 'Anna'), m('3', 'owner', 'Xaver'), m('4', 'admin', 'Bert')]);
    expect(sorted.map((x) => x.profile?.displayName)).toEqual(['Xaver', 'Bert', 'Anna', 'Zora']);
  });
});

function setup() {
  const auth = signedIn();
  const profiles = new FakeProfiles();
  const me = auth.user!.id;
  profiles.seed(me, { displayName: 'Max', username: 'max' });
  profiles.seed('u-anna', { displayName: 'Anna', username: 'anna' });
  const groups = new FakeGroups(auth, profiles);
  return { auth, profiles, groups, me };
}

describe('Gruppenseiten', () => {
  it('zeigt einen leeren Zustand und erstellt eine Gruppe', async () => {
    const { auth, profiles, groups } = setup();
    renderApp('/gruppe', { auth, profiles, groups });
    expect(await screen.findByText('Noch in keiner Gruppe')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Gruppe erstellen' }));
    await userEvent.type(await screen.findByLabelText('Name der Gruppe'), 'Hegering Nord');
    await userEvent.click(screen.getByRole('button', { name: 'Gruppe erstellen' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Hegering Nord' })).toBeInTheDocument();
    expect(screen.getByText('Deine Rolle:').parentElement).toHaveTextContent('Owner');
  });

  it('prüft den Gruppennamen', async () => {
    const { auth, profiles, groups } = setup();
    renderApp('/gruppe/neu', { auth, profiles, groups });
    await userEvent.click(await screen.findByRole('button', { name: 'Gruppe erstellen' }));
    expect(screen.getByLabelText('Name der Gruppe')).toHaveAttribute('aria-invalid', 'true');
    expect(groups.groups.size).toBe(0);
  });

  it('erzeugt als Owner einen Einladungscode und listet ihn', async () => {
    const { auth, profiles, groups, me } = setup();
    const id = groups.seedGroup('Revier Süd', [
      [me, 'owner'],
      ['u-anna', 'member'],
    ]);
    renderApp(`/gruppe/${id}`, { auth, profiles, groups });
    const list = await screen.findByRole('list', { name: 'Mitglieder' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: '20×' }));
    await userEvent.click(screen.getByRole('button', { name: 'Einladungscode erzeugen' }));
    expect(await screen.findByLabelText('Einladungscode')).toHaveTextContent(/^ABCD-EFGH-/);
    expect(groups.inviteList[0]).toMatchObject({ maxUses: 20 });
    const invites = await screen.findByRole('list', { name: 'Bisherige Einladungen' });
    expect(invites).toHaveTextContent('Aktiv');
    await userEvent.click(within(invites).getByRole('button', { name: 'Widerrufen' }));
    expect(await within(invites).findByText('Widerrufen')).toBeInTheDocument();
  });

  it('ändert Rollen und entfernt Mitglieder nach Bestätigung', async () => {
    const { auth, profiles, groups, me } = setup();
    const id = groups.seedGroup('Revier Süd', [
      [me, 'owner'],
      ['u-anna', 'member'],
    ]);
    renderApp(`/gruppe/${id}`, { auth, profiles, groups });
    await userEvent.selectOptions(await screen.findByLabelText('Rolle von Anna'), 'admin');
    await screen.findByDisplayValue('Admin');
    expect(groups.memberList.find((m) => m.userId === 'u-anna')?.role).toBe('admin');
    await userEvent.click(screen.getByRole('button', { name: 'Entfernen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ja, entfernen' }));
    expect(await screen.findByText('Mitglieder (1)')).toBeInTheDocument();
  });

  it('zeigt Mitgliedern keine Verwaltung und verlässt die Gruppe', async () => {
    const { auth, profiles, groups, me } = setup();
    const id = groups.seedGroup('Revier Süd', [
      ['u-anna', 'owner'],
      [me, 'member'],
    ]);
    renderApp(`/gruppe/${id}`, { auth, profiles, groups });
    expect(await screen.findByText('Mitglieder (2)')).toBeInTheDocument();
    expect(screen.queryByText('Einladungen')).not.toBeInTheDocument();
    expect(screen.queryByText('Einstellungen')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entfernen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gruppe löschen' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Gruppe verlassen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ja, verlassen' }));
    expect(await screen.findByText('Noch in keiner Gruppe')).toBeInTheDocument();
  });

  it('verhindert, dass der einzige Owner die Gruppe verlässt', async () => {
    const { auth, profiles, groups, me } = setup();
    const id = groups.seedGroup('Revier Süd', [[me, 'owner']]);
    renderApp(`/gruppe/${id}`, { auth, profiles, groups });
    await userEvent.click(await screen.findByRole('button', { name: 'Gruppe verlassen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ja, verlassen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('einzige Owner');
  });

  it('tritt über den Code aus dem Einladungslink bei', async () => {
    const { auth, profiles, groups } = setup();
    const id = groups.seedGroup('Revier Süd', [['u-anna', 'owner']]);
    auth.user = { id: 'u-anna', email: 'anna@revier.de', emailConfirmed: true };
    const { code } = await groups.createInvite(id, { validHours: 24, maxUses: 1 });
    auth.user = { id: 'u-max@revier.de', email: 'max@revier.de', emailConfirmed: true };
    renderApp(`/gruppe/beitreten?code=${code.replaceAll('-', '').toLowerCase()}`, { auth, profiles, groups });
    expect(await screen.findByLabelText('Einladungscode')).toHaveValue(code);
    await userEvent.click(screen.getByRole('button', { name: 'Beitreten' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Revier Süd' })).toBeInTheDocument();
    expect(screen.getByText('Deine Rolle:').parentElement).toHaveTextContent('Mitglied');
  });

  it('meldet einen ungültigen Code', async () => {
    const { auth, profiles, groups } = setup();
    renderApp('/gruppe/beitreten', { auth, profiles, groups });
    await userEvent.type(await screen.findByLabelText('Einladungscode'), 'ABCDEFGHJKMN');
    await userEvent.click(screen.getByRole('button', { name: 'Beitreten' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ungültig');
  });
});
