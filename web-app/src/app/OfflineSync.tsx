import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useAuth } from '../features/auth/AuthContext';
import { clearPersistence, registerOfflineMutations, startPersistence } from '../lib/offline';
import { deleteAllPacks } from '../modules/map/tileStore';
import { useServices } from './services';

/** Verbindet Anmeldung und Offline-Speicher: pro Benutzer speichern, beim Abmelden löschen. */
export function OfflineSync({ persist }: { persist: boolean }) {
  const { status, user } = useAuth();
  const client = useQueryClient();
  const services = useServices();
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (status !== 'signedIn' || !user) return;
    wasSignedIn.current = true;
    registerOfflineMutations(client, services, user.id);
    if (!persist) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    void startPersistence(client, user.id).then((unsubscribe) => {
      if (cancelled) unsubscribe();
      else stop = unsubscribe;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [status, user, client, services, persist]);

  useEffect(() => {
    if (status === 'signedOut' && wasSignedIn.current) {
      wasSignedIn.current = false;
      void clearPersistence(client);
      // Offline-Karten enthalten Reviergebiete und gehören zum Benutzer.
      void deleteAllPacks();
    }
  }, [status, client]);

  return null;
}
