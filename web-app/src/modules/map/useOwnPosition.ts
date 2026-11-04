import { useEffect, useState } from 'react';
import type { OwnPosition } from './MapView';

export type PositionState =
  | { status: 'off' }
  | { status: 'waiting' }
  | { status: 'ok'; position: OwnPosition }
  | { status: 'error'; message: string };

const MESSAGES: Record<number, string> = {
  1: 'Standortzugriff verweigert. Erlaube ihn in den Einstellungen (iPhone: Einstellungen → Datenschutz → Ortungsdienste → Safari-Websites).',
  2: 'Standort nicht verfügbar. Bist du draußen und ist GPS eingeschaltet?',
  3: 'Standort wird noch gesucht …',
};

/**
 * Eigener Standort nur zur Anzeige, solange die Seite sichtbar ist. Nichts wird gespeichert
 * oder geteilt; das Teilen für Treiber und Jagdleitung läuft getrennt (features/live).
 */
export function useOwnPosition(enabled: boolean): PositionState {
  const [result, setResult] = useState<PositionState | null>(null);
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  useEffect(() => {
    if (!enabled || !supported) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setResult({ status: 'ok', position: { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy } }),
      (e) => setResult((s) => (e.code === 3 && s?.status === 'ok' ? s : { status: 'error', message: MESSAGES[e.code] ?? e.message })),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    );
    return () => {
      navigator.geolocation.clearWatch(id);
      setResult(null);
    };
  }, [enabled, supported]);
  if (!enabled) return { status: 'off' };
  if (!supported) return { status: 'error', message: 'Dieses Gerät kann keinen Standort bestimmen.' };
  return result ?? { status: 'waiting' };
}
