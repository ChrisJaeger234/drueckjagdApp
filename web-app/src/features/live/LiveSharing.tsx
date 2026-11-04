import { Link } from '@tanstack/react-router';
import { Radio } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useServices } from '../../app/services';
import { mapError } from '../../lib/errors';
import { shouldSend } from './liveLogic';
import { liveStore, useLiveSettings, useLiveStatus } from './liveStore';

const GEO_MESSAGES: Record<number, string> = {
  1: 'Standortzugriff verweigert. Erlaube ihn in den Einstellungen (iPhone: Einstellungen → Datenschutz → Ortungsdienste → Safari-Websites).',
  2: 'Standort nicht verfügbar. Bist du draußen und ist GPS eingeschaltet?',
};

/**
 * Teilt den eigenen Standort, solange eine Freigabe aktiv ist und die App sichtbar ist
 * (ein Browser darf im Hintergrund kein GPS lesen). Hält auf Wunsch den Bildschirm an.
 */
export function LiveSharing() {
  const settings = useLiveSettings();
  const { hunts } = useServices();
  const last = useRef<{ at: number; lat: number; lng: number } | null>(null);
  const huntId = settings?.huntId ?? null;
  const keepAwake = settings?.keepAwake ?? false;

  useEffect(() => {
    if (!huntId) return;
    if (!('geolocation' in navigator)) {
      liveStore.setStatus({ kind: 'error', message: 'Dieses Gerät kann keinen Standort bestimmen.' });
      return;
    }
    last.current = null;
    let cancelled = false;
    let sending = false;
    liveStore.setStatus({ kind: 'waiting' });
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude };
        const now = Date.now();
        const s = liveStore.status();
        if (s.kind !== 'sharing') liveStore.setStatus({ kind: 'sharing', lastSentAt: null, accuracy: p.coords.accuracy });
        if (sending || !shouldSend(last.current, next, now)) return;
        sending = true;
        hunts
          .sharePosition(huntId, { ...next, accuracy: Math.round(p.coords.accuracy) })
          .then(() => {
            if (cancelled) return;
            last.current = { at: now, ...next };
            liveStore.setStatus({ kind: 'sharing', lastSentAt: now, accuracy: p.coords.accuracy });
          })
          .catch((e: unknown) => {
            if (cancelled) return;
            // Funkloch: beim nächsten Standort erneut versuchen. Sonst ist die Freigabe nicht mehr erlaubt.
            if (mapError(e).kind === 'network') return;
            liveStore.stop('Teilen beendet: Die Jagd läuft nicht mehr oder deine Rolle teilt keinen Standort.');
          })
          .finally(() => {
            sending = false;
          });
      },
      (e) => {
        if (e.code !== 3) liveStore.setStatus({ kind: 'error', message: GEO_MESSAGES[e.code] ?? e.message });
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    );
    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(id);
    };
  }, [huntId, hunts]);

  // Bildschirm anlassen; iOS gibt die Sperre beim Wechsel in den Hintergrund frei, daher neu anfordern.
  useEffect(() => {
    if (!huntId || !keepAwake || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let active = true;
    const request = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (active) lock = l;
          else void l.release();
        })
        .catch(() => undefined);
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', request);
      void lock?.release().catch(() => undefined);
    };
  }, [huntId, keepAwake]);

  return settings ? <LiveBanner huntId={settings.huntId} title={settings.huntTitle} /> : null;
}

function LiveBanner({ huntId, title }: { huntId: string; title: string }) {
  const status = useLiveStatus();
  const text = status.kind === 'error' ? status.message : status.kind === 'sharing' ? `Dein Standort wird geteilt: ${title}` : 'Standort wird gesucht …';
  return (
    <div role="status" className={`flex items-center gap-2 px-4 py-2 pt-[calc(env(safe-area-inset-top)+8px)] text-sm font-medium text-white ${status.kind === 'error' ? 'bg-danger' : 'bg-forest'}`}>
      <Radio aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">{text}</span>
      <Link to="/jagd/$huntId" params={{ huntId }} className="underline">
        Jagd
      </Link>
    </div>
  );
}
