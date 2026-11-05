// Phase 11: Umzug auf die eigene Domain.
//
// * movedTarget: Läuft die App noch unter einer alten Adresse (z. B. github.io), liefert sie die
//   neue Adresse für den Hinweis. Die neue Adresse kommt beim Bauen aus VITE_NEW_HOME.
// * stripLegacyPrefix: Alte Links und Lesezeichen zeigen auf /app/…; unter der eigenen Domain
//   liegt die App im Wurzelverzeichnis.

export function movedTarget(newHome: string | undefined, currentOrigin: string): string | null {
  if (!newHome) return null;
  try {
    const target = new URL(newHome);
    return target.protocol === 'https:' && target.origin !== currentOrigin ? target.href : null;
  } catch {
    return null;
  }
}

/** Neuer Pfad ohne „/app“, oder null, wenn nichts zu tun ist. Nur wenn die App im Wurzelverzeichnis liegt. */
export function stripLegacyPrefix(base: string, pathname: string): string | null {
  if (base !== '/') return null;
  if (pathname === '/app' || pathname === '/app/') return '/';
  return pathname.startsWith('/app/') ? pathname.slice(4) : null;
}
