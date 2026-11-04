/// <reference lib="webworker" />
// Service Worker: App-Dateien vorab speichern (Offline-Start) und jede Navigation
// innerhalb der App mit index.html beantworten, damit auch /karte offline öffnet.
// Push-Empfang und Kartenkacheln kommen in späteren Phasen dazu.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
