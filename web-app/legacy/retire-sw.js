// Phase 11: Ersatz für einen Service Worker unter /app/ (alter Pfad).
// Wer die App kurz unter https://<domain>/app/ installiert hatte, bekommt beim nächsten Update
// diesen Worker: er meldet sich ab und lädt offene Fenster neu, die dann auf / umgeleitet werden.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.registration.unregister();
      const windows = await self.clients.matchAll({ type: 'window' });
      for (const w of windows) w.navigate(w.url).catch(() => undefined);
    })(),
  );
});
