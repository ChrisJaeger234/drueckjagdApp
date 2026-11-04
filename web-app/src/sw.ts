/// <reference lib="webworker" />
// Service Worker: App-Dateien vorab speichern (Offline-Start) und jede Navigation
// innerhalb der App mit index.html beantworten, damit auch /karte offline öffnet.
// Außerdem: Web-Push anzeigen und beim Antippen die passende Seite der App öffnen.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { targetUrl } from './features/push/pushTarget';

declare const self: ServiceWorkerGlobalScope;

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// --- Web-Push (Phase 9) ------------------------------------------------------
interface PushPayload {
  title?: string;
  body?: string;
  /** Pfad innerhalb der App ohne führenden Schrägstrich, z. B. „chat/<id>“. */
  url?: string;
  tag?: string;
}

self.addEventListener('push', (event) => {
  let data: PushPayload;
  try {
    data = (event.data?.json() as PushPayload) ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Drückjagd', {
      body: data.body ?? '',
      tag: data.tag,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      data: { path: data.url ?? '' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = targetUrl(String(event.notification.data?.path ?? ''), self.registration.scope);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => w.url.startsWith(self.registration.scope));
      if (open) {
        await open.focus();
        if ('navigate' in open) await open.navigate(url).catch(() => undefined);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
