import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { deletePack, downloadPack, listPacks, type OfflinePack, type PackProgress, type PackRequest } from '../../modules/map/tileStore';

export const packKeys = { all: ['map-packs'] as const };

/** Gespeicherte Offline-Pakete (nur lokal, unabhängig vom Netz). */
export function useOfflinePacks() {
  return useQuery({ queryKey: packKeys.all, queryFn: listPacks, networkMode: 'always', staleTime: Infinity });
}

export function useOfflinePack(revierId: string | null | undefined): OfflinePack | null {
  const { data } = useOfflinePacks();
  return data?.find((p) => p.revierId === revierId) ?? null;
}

/** Download eines Pakets mit Fortschritt und Abbruch. Verlässt man die Seite, endet der Download. */
export function usePackDownload() {
  const client = useQueryClient();
  const [progress, setProgress] = useState<PackProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const start = useCallback(
    async (req: PackRequest) => {
      if (controller.current) return;
      const ctrl = new AbortController();
      controller.current = ctrl;
      setError(null);
      setProgress({ done: 0, total: 0, failed: 0, bytes: 0 });
      try {
        await downloadPack(req, { signal: ctrl.signal, onProgress: setProgress });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Download fehlgeschlagen.');
      } finally {
        controller.current = null;
        setProgress(null);
        void client.invalidateQueries({ queryKey: packKeys.all });
      }
    },
    [client],
  );

  const cancel = useCallback(() => controller.current?.abort(), []);

  const remove = useCallback(
    async (revierId: string) => {
      await deletePack(revierId);
      await client.invalidateQueries({ queryKey: packKeys.all });
    },
    [client],
  );

  return { start, cancel, remove, progress, running: progress !== null, error };
}
