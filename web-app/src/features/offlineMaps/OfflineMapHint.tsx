import { Link } from '@tanstack/react-router';
import { offlineMapsSupported } from '../../modules/map/tileStore';
import { formatDate } from './OfflineMapCard';
import { useOfflinePack } from './useOfflinePacks';

/** Kurzer Hinweis auf der Jagdseite, ob die Revierkarte offline verfügbar ist. */
export function OfflineMapHint({ revierId }: { revierId: string }) {
  const pack = useOfflinePack(revierId);
  if (!offlineMapsSupported()) return null;
  return pack ? (
    <p className="text-sm text-muted">Karte offline gespeichert (Stand {formatDate(pack.savedAt)}).</p>
  ) : (
    <p className="text-sm">
      <Link to="/revier/$revierId" params={{ revierId }} className="font-medium text-primary">
        Karte fürs Funkloch speichern
      </Link>
    </p>
  );
}
