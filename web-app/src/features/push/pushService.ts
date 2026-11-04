// Web-Push (Phase 9, Teil 2): Benachrichtigungen für neue Chatnachrichten und „angeschossen“.
//
// * Das Gerät meldet sich beim Push-Dienst des Browsers an (pushManager.subscribe) und speichert
//   das Abo über die RPC register_push_subscription in Supabase.
// * Nach einer erfolgreich gespeicherten Nachricht bzw. Meldung ruft die App die Edge Function
//   „notify“ auf; die verschickt die Benachrichtigungen an die anderen.
// * Auf dem iPhone geht Web-Push nur in der zum Home-Bildschirm hinzugefügten App (iOS 16.4+).
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, check, guard, unwrap } from '../../lib/errors';

export interface PushSettings {
  chat: boolean;
  reports: boolean;
}

export type PushState =
  /** Browser kann kein Web-Push. */
  | 'unsupported'
  /** iPhone/iPad im Browser: erst zum Home-Bildschirm hinzufügen. */
  | 'needs-install'
  /** Benachrichtigungen in den Einstellungen verboten. */
  | 'denied'
  | 'off'
  | 'on';

export interface PushStatus {
  state: PushState;
  settings: PushSettings;
}

export type NotifyRequest = { type: 'message' | 'report'; id: string };

export interface PushService {
  status(): Promise<PushStatus>;
  enable(settings: PushSettings): Promise<void>;
  update(settings: PushSettings): Promise<void>;
  /** Dieses Gerät abmelden (auch beim Abmelden aus der App). Wirft nie. */
  disable(): Promise<void>;
  /** Andere benachrichtigen. Wirft nie: eine fehlende Benachrichtigung darf das Senden nicht stören. */
  notify(request: NotifyRequest): Promise<void>;
}

export const DEFAULT_SETTINGS: PushSettings = { chat: true, reports: true };

export function isIos(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> = navigator) {
  return /iPhone|iPad|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
}

export function isStandalone() {
  return (
    (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** VAPID-Schlüssel (Base64url) in das Format für pushManager.subscribe. */
export function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array) => !!a && a.byteLength === b.byteLength && new Uint8Array(a).every((v, i) => v === b[i]);

export function createSupabasePushService(client: SupabaseClient): PushService {
  const registration = () => navigator.serviceWorker.ready;
  const current = async () => (pushSupported() ? (await registration()).pushManager.getSubscription() : null);

  async function publicKey(): Promise<string> {
    const { data, error } = await client.functions.invoke<{ publicKey?: string }>('notify', { body: { type: 'config' } });
    if (error || !data?.publicKey) throw new AppError('Benachrichtigungen sind auf dem Server noch nicht eingerichtet.', 'unknown');
    return data.publicKey;
  }

  async function save(sub: PushSubscription, settings: PushSettings) {
    const json = sub.toJSON();
    check(
      await client.rpc('register_push_subscription', {
        p_endpoint: sub.endpoint,
        p_p256dh: json.keys?.p256dh ?? '',
        p_auth: json.keys?.auth ?? '',
        p_user_agent: navigator.userAgent.slice(0, 300),
        p_notify_chat: settings.chat,
        p_notify_reports: settings.reports,
      }),
    );
  }

  return {
    status: async () => {
      if (!pushSupported()) return { state: isIos() && !isStandalone() ? 'needs-install' : 'unsupported', settings: DEFAULT_SETTINGS };
      if (Notification.permission === 'denied') return { state: 'denied', settings: DEFAULT_SETTINGS };
      const sub = await current();
      if (!sub || Notification.permission !== 'granted') return { state: 'off', settings: DEFAULT_SETTINGS };
      const rows = unwrap(await client.from('push_subscriptions').select('notify_chat, notify_reports').eq('endpoint', sub.endpoint));
      // Abo auf dem Gerät, aber nicht (mehr) beim Benutzer: gilt als aus.
      const row = rows[0];
      if (!row) return { state: 'off', settings: DEFAULT_SETTINGS };
      return { state: 'on', settings: { chat: row.notify_chat, reports: row.notify_reports } };
    },

    enable: (settings) =>
      guard(async () => {
        if (!pushSupported()) throw new AppError('Dieses Gerät unterstützt keine Benachrichtigungen.', 'unknown');
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') throw new AppError('Benachrichtigungen wurden nicht erlaubt. Das lässt sich in den Einstellungen des Geräts ändern.', 'forbidden');
        const key = keyToBytes(await publicKey());
        const reg = await registration();
        let sub = await reg.pushManager.getSubscription();
        // Neuer Serverschlüssel: altes Abo ist wertlos.
        if (sub && !sameKey(sub.options.applicationServerKey, key)) {
          await sub.unsubscribe();
          sub = null;
        }
        sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        await save(sub, settings);
      }),

    update: (settings) =>
      guard(async () => {
        const sub = await current();
        if (!sub) throw new AppError('Benachrichtigungen sind auf diesem Gerät nicht aktiv.', 'unknown');
        await save(sub, settings);
      }),

    disable: async () => {
      try {
        const sub = await current();
        if (!sub) return;
        await client
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', sub.endpoint)
          .then(
            () => undefined,
            () => undefined,
          );
        // Auch ohne Netz: ein abgemeldetes Abo meldet der Push-Dienst dem Server als „weg“.
        await sub.unsubscribe();
      } catch {
        // Nichts zu tun.
      }
    },

    notify: async (request) => {
      try {
        await client.functions.invoke('notify', { body: request });
      } catch {
        // Benachrichtigungen sind ein Zusatz; das Speichern ist schon geglückt.
      }
    },
  };
}
