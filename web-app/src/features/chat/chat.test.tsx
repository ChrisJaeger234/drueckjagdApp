import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onlineManager } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeChat, FakeGroups, FakeProfiles } from '../../test/fakes';
import { renderApp, signedIn } from '../../test/renderApp';
import { dayLabel, sortMessages, type ChatMessage } from './chatModel';

function setup() {
  const auth = signedIn();
  const me = auth.user!.id;
  const profiles = new FakeProfiles();
  profiles.seed(me, { displayName: 'Max', username: 'max' });
  profiles.seed('u-anna', { displayName: 'Anna', username: 'anna' });
  const groups = new FakeGroups(auth, profiles);
  const groupId = groups.seedGroup('Hegering Nord', [
    [me, 'member'],
    ['u-anna', 'owner'],
  ]);
  const other = groups.seedGroup('Fremde Gruppe', [['u-anna', 'owner']]);
  const chat = new FakeChat(auth, groups, profiles);
  return { auth, profiles, groups, chat, groupId, other, me };
}

describe('Chatregeln', () => {
  it('sortiert chronologisch, wartende zuletzt', () => {
    const m = (id: string, createdAt: string, pending?: boolean) => ({ id, createdAt, pending }) as ChatMessage;
    expect(sortMessages([m('b', '2026-11-21T09:00:00Z', true), m('c', '2026-11-21T10:00:00Z'), m('a', '2026-11-21T08:00:00Z')]).map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });

  it('beschriftet Tage', () => {
    const now = new Date(2026, 10, 21, 12);
    expect(dayLabel(new Date(2026, 10, 21, 8).toISOString(), now)).toBe('Heute');
    expect(dayLabel(new Date(2026, 10, 20, 8).toISOString(), now)).toBe('Gestern');
    expect(dayLabel(new Date(2026, 10, 18, 8).toISOString(), now)).toMatch(/18\.11\.2026/);
  });
});

describe('Gruppenchat', () => {
  afterEach(() => onlineManager.setOnline(true));

  it('listet die Chats der eigenen Gruppen', async () => {
    const s = setup();
    renderApp('/chat', s);
    const list = await screen.findByRole('list', { name: 'Chats' });
    expect(within(list).getByRole('link', { name: /Hegering Nord/ })).toBeInTheDocument();
    expect(within(list).queryByText('Fremde Gruppe')).not.toBeInTheDocument();
  });

  it('sendet, empfängt in Echtzeit und löscht eigene Nachrichten', async () => {
    const s = setup();
    s.chat.receive(s.groupId, 'u-anna', 'Treffen 7 Uhr am Hof');
    renderApp(`/chat/${s.groupId}`, s);
    const list = await screen.findByRole('list', { name: 'Nachrichten' });
    expect(within(list).getByText('Treffen 7 Uhr am Hof')).toBeInTheDocument();
    expect(within(list).getByText('Anna')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Nachricht'), 'Bin dabei, bringe den Hund mit');
    await userEvent.click(screen.getByRole('button', { name: 'Senden' }));
    expect(await within(list).findByText('Bin dabei, bringe den Hund mit')).toBeInTheDocument();
    expect(screen.getByLabelText('Nachricht')).toHaveValue('');
    expect(s.chat.messageList.at(-1)).toMatchObject({ senderId: s.me, content: 'Bin dabei, bringe den Hund mit' });

    act(() => s.chat.receive(s.groupId, 'u-anna', 'Super!'));
    expect(await within(list).findByText('Super!')).toBeInTheDocument();

    // Nur eigene Nachrichten haben einen Löschknopf.
    expect(screen.getAllByRole('button', { name: 'Nachricht löschen' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Nachricht löschen' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Löschen' }));
    await screen.findByText('Super!');
    expect(screen.queryByText('Bin dabei, bringe den Hund mit')).not.toBeInTheDocument();
    expect(s.chat.messageList.map((m) => m.content)).toEqual(['Treffen 7 Uhr am Hof', 'Super!']);
  });

  it('schreibt im Funkloch: Nachricht wartet und geht beim nächsten Netz raus', async () => {
    const s = setup();
    renderApp(`/chat/${s.groupId}`, s);
    await screen.findByText(/Noch keine Nachrichten/);
    act(() => onlineManager.setOnline(false));
    await userEvent.type(screen.getByLabelText('Nachricht'), 'Sau liegt am Bach');
    await userEvent.click(screen.getByRole('button', { name: 'Senden' }));
    expect(await screen.findByText('Wartet auf Netz')).toBeInTheDocument();
    expect(s.chat.messageList).toHaveLength(0);
    act(() => onlineManager.setOnline(true));
    await screen.findByText('Sau liegt am Bach');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(s.chat.messageList.map((m) => m.content)).toEqual(['Sau liegt am Bach']);
    expect(screen.queryByText('Wartet auf Netz')).not.toBeInTheDocument();
  });

  it('zeigt fremden Gruppen keine Nachrichten', async () => {
    const s = setup();
    s.chat.receive(s.other, 'u-anna', 'Geheim');
    renderApp(`/chat/${s.other}`, s);
    expect(await screen.findByText(/Noch keine Nachrichten/)).toBeInTheDocument();
    expect(screen.queryByText('Geheim')).not.toBeInTheDocument();
  });
});
