import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { Badge, Card, Page } from '../../components/ui';
import { FormError } from '../../components/form';
import { mapError } from '../../lib/errors';
import { bboxOf } from '../../modules/map/geo';
import type { LayerId } from '../../modules/map/layers';
import { LazyMap } from '../../modules/map/LazyMap';
import { useOwnPosition } from '../../modules/map/useOwnPosition';
import { MapToolbar } from '../reviere/mapControls';
import { CATEGORY_LABEL, type Waypoint } from '../reviere/revierModel';
import { useAllReviere, useBoundaries, useWaypoints } from '../reviere/useReviere';

/** Übersichtskarte aller Reviere aus allen eigenen Gruppen. */
export function MapPage() {
  const { data: reviere, error, isPending } = useAllReviere();
  const ids = useMemo(() => (reviere ?? []).map((r) => r.id), [reviere]);
  const { data: boundaries = [] } = useBoundaries(ids);
  const { data: waypoints = [] } = useWaypoints(ids);
  const [layer, setLayer] = useState<LayerId>('karte');
  const [locate, setLocate] = useState(false);
  const position = useOwnPosition(locate);
  const [selected, setSelected] = useState<Waypoint | null>(null);
  const fit = useMemo(() => bboxOf([...boundaries.map((b) => b.geometry), ...waypoints.map((w) => [w.lng, w.lat])]), [boundaries, waypoints]);
  const revierName = (id: string) => reviere?.find((r) => r.id === id)?.name ?? '';

  return (
    <Page title="Karte">
      <MapToolbar layer={layer} onLayer={setLayer} locate={locate} onLocate={setLocate} position={position} />
      <LazyMap
        className="h-[62vh] min-h-80"
        layer={layer}
        boundaries={boundaries}
        waypoints={waypoints}
        position={position.status === 'ok' ? position.position : null}
        fit={fit}
        fitKey={`${boundaries.length}:${waypoints.length > 0}`}
        onMapClick={() => setSelected(null)}
        onWaypointClick={setSelected}
      />
      {error && <FormError message={mapError(error).message} />}
      {selected && (
        <Card className="grid gap-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">{selected.name}</h2>
            <Badge>{CATEGORY_LABEL[selected.category]}</Badge>
          </div>
          {selected.description && <p className="whitespace-pre-line text-sm">{selected.description}</p>}
          <Link to="/revier/$revierId" params={{ revierId: selected.revierId }} className="text-sm font-medium text-primary">
            Revier {revierName(selected.revierId)} öffnen
          </Link>
        </Card>
      )}
      {!isPending && reviere?.length === 0 && (
        <Card>
          <p className="text-sm text-muted">
            Noch keine Reviere. Owner und Admins legen sie in der{' '}
            <Link to="/gruppe" className="font-medium text-primary">
              Gruppe
            </Link>{' '}
            an.
          </p>
        </Card>
      )}
      {reviere && reviere.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">Reviere</h2>
          <ul className="grid gap-1" aria-label="Reviere">
            {reviere.map((r) => (
              <li key={r.id}>
                <Link to="/revier/$revierId" params={{ revierId: r.id }} className="flex min-h-11 items-center justify-between gap-2 rounded-xl px-2 hover:bg-sand-light/40">
                  <span className="font-medium">{r.name}</span>
                  {r.groupName && <span className="text-sm text-muted">{r.groupName}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
  );
}
