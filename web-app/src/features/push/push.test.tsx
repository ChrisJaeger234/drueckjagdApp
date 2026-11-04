import { onlineManager } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { displayName, isAllowedEndpoint, isFresh, messagePayload, parseRequest, recipients, reportPayload } from '../../../../supabase/functions/notify/logic';
import { FakeChat, FakeGroups, FakeHunts, FakeProfiles, FakePush } from '../../test/fakes';
import { renderApp, signedIn } from '../../test/renderApp';
import { isIos, keyToBytes } from './pushService';
import { targetUrl } from './pushTarget';

afterEach(() => onlineManager.setOnline(true));

describe('Server-Logik der Benachrichtigungen', () => {
  const id = '3f1c0c6e-1d2a-4b9e-9a51-7e0b8c2d4f10';

  it('nimmt nur gültige Anfragen an', () => {
    expect(parseRequest({ type: 'message', id })).toEqual({ type: 'message', id });
    expect(parseRequest({ type: 'config' })).toEqual({ type: 'config' });
    expect(parseRequest({ type: 'report', id: 'x' })).toBeNull();
    expect(parseRequest({ type: 'alle', id })).toBeNull();
    expect(parseRequest(null)).toBeNull();
  });

  it('schreibt nur bekannte Push-Dienste an', () => {
    expect(isAllowedEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isAllowedEndpoint('https://web.push.apple.com/QG')).toBe(true);
    expect(isAllowedEndpoint('https://wns2-db5p.notify.windows.com/w/?token=1')).toBe(true);
    expect(isAllowedEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(isAllowedEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(isAllowedEndpoint('https://evil.example/push.apple.com')).toBe(false);
    expect(isAllowedEndpoint('https://push.apple.com.evil.example/')).toBe(false);
    expect(isAllowedEndpoint('kaputt')).toBe(false);
  });

  it('ignoriert alte Nachrichten und den Absender', () => {
    const now = Date.parse('2026-11-21T12:00:00Z');
    expect(isFresh('2026-11-21T08:00:00Z', now)).toBe(true);
    expect(isFresh('2026-11-19T08:00:00Z', now)).toBe(false);
    expect(recipients(['a', 'b', 'a', null, 'me'], 'me')).toEqual(['a', 'b']);
  });

  it('baut Titel, Text und Ziel', () => {
    expect(displayName({ display_name: ' ', username: 'max' })).toBe('@max');
    expect(displayName(null)).toBe('Jemand');
    const m = messagePayload({ id, group_id: 'g1', content: 'Treffen\n7 Uhr' }, 'Hegering', 'Anna');
    expect(m).toEqual({ title: 'Hegering', body: 'Anna: Treffen 7 Uhr', url: 'chat/g1', tag: 'chat-g1' });
    expect(messagePayload({ id, group_id: 'g1', content: 'x'.repeat(500) }, 'H', 'A').body.length).toBe(160);
    const r = reportPayload({ id, hunt_id: 'h1', species: 'Rehwild', count: 2 }, 'Drückjagd Nord', 'Stand 7', 'Max');
    expect(r).toMatchObject({ title: 'Nachsuche: angeschossen (Drückjagd Nord)', body: '2× Rehwild · Stand 7 · Max', url: 'jagd/h1' });
  });
});

describe('Gerät', () => {
  it('öffnet beim Antippen nur Seiten der App', () => {
    const scope = 'https://chrisjaeger234.github.io/drueckjagdApp/app/';
    expect(targetUrl('chat/g1', scope)).toBe(`${scope}chat/g1`);
    expect(targetUrl('jagd/h-1', scope)).toBe(`${scope}jagd/h-1`);
    expect(targetUrl('//evil.example/x', scope)).toBe(scope);
    expect(targetUrl('https://evil.example', scope)).toBe(scope);
    expect(targetUrl('../../x', scope)).toBe(scope);
    expect(targetUrl(undefined, scope)).toBe(scope);
  });

  it('erkennt iPhone und iPad', () => {
    expect(isIos({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 0 })).toBe(false);
  });

  it('wandelt den VAPID-Schlüssel um', () => {
    expect([...keyToBytes('AQID_-8')]).toEqual([1, 2, 3, 255, 239]);
  });
});

describe('Einstellungen im Profil', () => {
  it('schaltet ein, ändert die Auswahl und schaltet aus', async () => {
    const push = new FakePush();
    renderApp('/profil', { auth: signedIn(), push });
    await userEvent.click(await screen.findByRole('button', { name: 'Benachrichtigungen einschalten' }));
    const chat = await screen.findByRole('switch', { name: 'Neue Chatnachrichten' });
    expect(chat).toBeChecked();
    await userEvent.click(chat);
    await waitFor(() => expect(push.settings).toEqual({ chat: false, reports: true }));
    expect(screen.getByRole('switch', { name: /Nachsuche/ })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Auf diesem Gerät ausschalten' }));
    expect(await screen.findByRole('button', { name: 'Benachrichtigungen einschalten' })).toBeInTheDocument();
    expect(push.state).toBe('off');
  });

  it('erklärt, wenn Benachrichtigungen nicht erlaubt werden', async () => {
    const push = new FakePush();
    push.deny = true;
    renderApp('/profil', { auth: signedIn(), push });
    await userEvent.click(await screen.findByRole('button', { name: 'Benachrichtigungen einschalten' }));
    expect(await screen.findByText(/Benachrichtigungen sind für diese App blockiert/)).toBeInTheDocument();
  });

  it('zeigt auf dem iPhone im Browser den Weg über den Home-Bildschirm', async () => {
    const push = new FakePush();
    push.state = 'needs-install';
    renderApp('/profil', { auth: signedIn(), push });
    expect(await screen.findByText(/Zum Home-Bildschirm/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Benachrichtigungen einschalten' })).not.toBeInTheDocument();
  });

  it('meldet das Gerät beim Abmelden ab', async () => {
    const push = new FakePush();
    push.state = 'on';
    const auth = signedIn();
    renderApp('/profil', { auth, push });
    await userEvent.click(await screen.findByRole('button', { name: 'Abmelden' }));
    await waitFor(() => expect(auth.user).toBeNull());
    expect(push.disabled).toBeGreaterThan(0);
    expect(push.state).toBe('off');
  });
});

describe('Auslösen', () => {
  function setup() {
    const auth = signedIn();
    const me = auth.user!.id;
    const profiles = new FakeProfiles();
    profiles.seed(me, { displayName: 'Max', username: 'max' });
    const groups = new FakeGroups(auth, profiles);
    const groupId = groups.seedGroup('Hegering', [[me, 'member']]);
    const hunts = new FakeHunts(auth, groups, profiles);
    const huntId = hunts.seedHunt(groupId, { status: 'laufend' });
    hunts.seedParticipant(huntId, me, 'schuetze', hunts.seedStand(huntId, 'Stand 7'));
    const chat = new FakeChat(auth, groups, profiles);
    return { auth, profiles, groups, hunts, chat, groupId, huntId, push: new FakePush() };
  }

  it('benachrichtigt nach dem Senden einer Chatnachricht', async () => {
    const s = setup();
    renderApp(`/chat/${s.groupId}`, s);
    await userEvent.type(await screen.findByLabelText('Nachricht'), 'Moin');
    await userEvent.click(screen.getByRole('button', { name: 'Senden' }));
    await waitFor(() => expect(s.push.notified).toEqual([{ type: 'message', id: s.chat.messageList[0]!.id }]));
  });

  it('benachrichtigt bei „angeschossen“ erst, wenn die Meldung aus dem Funkloch heraus angekommen ist', async () => {
    const s = setup();
    renderApp(`/jagd/${s.huntId}`, s);
    await screen.findByText('Dein Stand: Stand 7');
    act(() => onlineManager.setOnline(false));
    await userEvent.click(screen.getByRole('button', { name: 'Angeschossen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Rehwild' }));
    await userEvent.click(screen.getByRole('button', { name: 'Angeschossen melden' }));
    expect(s.push.notified).toHaveLength(0);
    act(() => onlineManager.setOnline(true));
    await within(screen.getByRole('list', { name: 'Meldungen' })).findByText('Nachsuche offen');
    expect(s.push.notified).toEqual([{ type: 'report', id: s.hunts.reportList[0]!.id }]);
  });

  it('benachrichtigt bei „erlegt“ nicht', async () => {
    const s = setup();
    renderApp(`/jagd/${s.huntId}`, s);
    await screen.findByText('Dein Stand: Stand 7');
    await userEvent.click(screen.getByRole('button', { name: 'Erlegt' }));
    await userEvent.click(screen.getByRole('button', { name: 'Rehwild' }));
    await userEvent.click(screen.getByRole('button', { name: 'Erlegt melden' }));
    await waitFor(() => expect(s.hunts.reportList).toHaveLength(1));
    expect(s.push.notified).toHaveLength(0);
  });
});
