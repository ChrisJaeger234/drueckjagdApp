import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Card, ConfirmButton } from '../../components/ui';
import { formatMb, offlineMapsSupported } from '../../modules/map/tileStore';
import { packSummary } from './OfflineMapCard';
import { useOfflinePacks, usePackDownload } from './useOfflinePacks';

/** Übersicht im Profil: welche Karten liegen auf dem Gerät, wie viel Platz belegt die App. */
export function OfflinePacksCard() {
  const { data: packs = [] } = useOfflinePacks();
  const { remove } = usePackDownload();
  const [usage, setUsage] = useState<string | null>(null);

  useEffect(() => {
    void navigator.storage
      ?.estimate?.()
      .then((e) => e.usage !== undefined && setUsage(formatMb(e.usage)))
      .catch(() => undefined);
  }, [packs]);

  if (!offlineMapsSupported()) return null;
  return (
    <Card className="grid gap-2">
      <h2 className="font-semibold">Offline-Karten</h2>
      {packs.length === 0 ? (
        <p className="text-sm text-muted">Noch keine Karte gespeichert. Das geht auf der Seite des Reviers.</p>
      ) : (
        <ul className="grid gap-3" aria-label="Offline-Karten">
          {packs.map((p) => (
            <li key={p.revierId} className="grid gap-1">
              <Link to="/revier/$revierId" params={{ revierId: p.revierId }} className="font-medium text-primary">
                {p.name}
              </Link>
              <p className="text-sm text-muted">{packSummary(p)}</p>
              <ConfirmButton label="Löschen" confirmText={`Offline-Karte von „${p.name}“ vom Gerät löschen?`} confirmLabel="Löschen" onConfirm={() => void remove(p.revierId)} />
            </li>
          ))}
        </ul>
      )}
      {usage && <p className="text-sm text-muted">Die App belegt auf diesem Gerät insgesamt {usage}.</p>}
    </Card>
  );
}
