/** Ziel beim Antippen einer Benachrichtigung: nur Seiten innerhalb der App (kein Weiterleiten). */
export function targetUrl(path: string | undefined, scope: string): string {
  const base = new URL(scope);
  if (!path || !/^[A-Za-z0-9/_-]+$/.test(path) || path.startsWith('/')) return base.href;
  const url = new URL(path, base);
  return url.origin === base.origin && url.pathname.startsWith(base.pathname) ? url.href : base.href;
}
