/** Abstand zweier Punkte in Metern (Haversine). */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Höchstens alle 10 s senden, wenn man sich bewegt hat, sonst alle 30 s als Lebenszeichen. */
export const MIN_INTERVAL_MS = 10_000;
export const HEARTBEAT_MS = 30_000;
export const MIN_MOVE_M = 20;

export function shouldSend(
  last: { at: number; lat: number; lng: number } | null,
  next: { lat: number; lng: number },
  now: number,
): boolean {
  if (!last) return true;
  const elapsed = now - last.at;
  if (elapsed >= HEARTBEAT_MS) return true;
  return elapsed >= MIN_INTERVAL_MS && distanceMeters(last, next) >= MIN_MOVE_M;
}
