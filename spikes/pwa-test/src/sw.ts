/// <reference lib="webworker" />
// Service Worker des Machbarkeitstests:
// - App-Dateien vorab speichern, damit die App ohne Netz startet
// - Web-Push empfangen und anzeigen
// Kartenkacheln liest die Seite selbst aus dem Cache "tiles-v1" (siehe main.ts),
// damit es auch dort funktioniert, wo Worker-Anfragen nicht am Service Worker vorbeikommen.
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

self.skipWaiting();
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('push', (event) => {
  let payload: { title?: string; body?: string } = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Drückjagd-Test', {
      body: payload.body ?? 'Push-Nachricht angekommen.',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: 'push-test',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list[0];
      return open ? open.focus() : self.clients.openWindow(self.registration.scope);
    }),
  );
});
