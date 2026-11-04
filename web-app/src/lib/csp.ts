// Content-Security-Policy der gebauten App (Phase 10). GitHub Pages kann keine Header setzen,
// deshalb als <meta http-equiv> in index.html (frame-ancestors geht so nicht; Einbetten in fremde
// Seiten ist ohne Header nicht abschaltbar).
//
// Erlaubt sind nur die eigene Herkunft, das Supabase-Projekt (HTTPS und Realtime per WebSocket)
// und die beiden Kartendienste. Kein eval, keine fremden Skripte.

export const MAP_HOSTS = ['https://sgx.geodatenzentrum.de', 'https://www.wmts.nrw.de'];

export function buildCsp(supabaseUrl: string): string {
  const sources: string[] = [];
  try {
    const u = new URL(supabaseUrl);
    sources.push(u.origin, `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}`);
  } catch {
    // Ohne gültige URL zeigt die App ohnehin nur den Einrichtungshinweis.
  }
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    // Kartenbibliothek und React setzen Inline-Styles.
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', ...sources.slice(0, 1), ...MAP_HOSTS],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", ...sources, ...MAP_HOSTS],
    // MapLibre startet seine Worker aus einem Blob.
    'worker-src': ["'self'", 'blob:'],
    'child-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(' ')}`)
    .join('; ');
}
