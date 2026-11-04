import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, FileUp, MapPin, Pencil, PencilLine, Undo2 } from 'lucide-react';
import type { Position } from 'geojson';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Badge, Button, Card, ConfirmButton, Page } from '../../components/ui';
import { FormError, FormSuccess } from '../../components/form';
import { mapError } from '../../lib/errors';
import { areaHectares, bboxOf, BoundaryImportError, parseBoundaryFile, polygonFromPoints } from '../../modules/map/geo';
import type { LayerId } from '../../modules/map/layers';
import { LazyMap } from '../../modules/map/LazyMap';
import { useOwnPosition } from '../../modules/map/useOwnPosition';
import { useUser } from '../auth/AuthContext';
import type { GroupPermissions } from '../groups/groupModel';
import { useMyGroup } from '../groups/useGroups';
import { MapToolbar, WaypointForm } from './mapControls';
import { CATEGORY_LABEL, categoryColor, waypointMarkers, type Revier, type Waypoint } from './revierModel';
import { useBoundaries, useRevier, useRevierActions, useWaypoints } from './useReviere';

const errorText = (e: unknown) => (e ? mapError(e).message : null);
const hectares = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

export function RevierPage() {
  const { revierId } = useParams({ from: '/shell/revier/$revierId' });
  const { data: revier, error } = useRevier(revierId);
  if (!revier) {
    return (
      <Page title="Revier">
        {error ? <FormError message={errorText(error)} /> : <p className="text-sm text-muted">Revier wird geladen …</p>}
      </Page>
    );
  }
  return <RevierView revier={revier} />;
}

type Mode =
  | { kind: 'view' }
  | { kind: 'draw'; points: Position[] }
  | { kind: 'place'; point: { lat: number; lng: number } | null }
  | { kind: 'edit'; waypoint: Waypoint };

function RevierView({ revier }: { revier: Revier }) {
  const user = useUser();
  const { permissions } = useMyGroup(revier.groupId);
  const ids = useMemo(() => [revier.id], [revier.id]);
  const { data: boundaries = [] } = useBoundaries(ids);
  const { data: waypoints = [] } = useWaypoints(ids);
  const markers = useMemo(() => waypointMarkers(waypoints), [waypoints]);
  const actions = useRevierActions();
  const navigate = useNavigate();

  const [layer, setLayer] = useState<LayerId>('karte');
  const [locate, setLocate] = useState(false);
  const position = useOwnPosition(locate);
  const [mode, setMode] = useState<Mode>({ kind: 'view' });
  const [selected, setSelected] = useState<Waypoint | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const boundary = boundaries[0] ?? null;
  const fit = useMemo(() => bboxOf([...boundaries.map((b) => b.geometry), ...waypoints.map((w) => [w.lng, w.lat])]), [boundaries, waypoints]);
  const canEdit = permissions?.canEditRevier ?? false;
  const canEditWaypoint = (w: Waypoint) => canEdit || w.createdBy === user.id;
  const ownPos = position.status === 'ok' ? position.position : null;

  function onMapClick({ lng, lat }: { lng: number; lat: number }) {
    if (mode.kind === 'draw') setMode({ kind: 'draw', points: [...mode.points, [lng, lat]] });
    else if (mode.kind === 'place') setMode({ kind: 'place', point: { lat, lng } });
    else setSelected(null);
  }

  function finishDrawing(points: Position[]) {
    const polygon = polygonFromPoints(points);
    if (!polygon) return;
    actions.saveBoundary.mutate(
      { revierId: revier.id, geometry: polygon },
      {
        onSuccess: () => {
          setMode({ kind: 'view' });
          setNotice('Reviergrenze gespeichert.');
        },
      },
    );
  }

  async function onImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError(null);
    try {
      const geometry = parseBoundaryFile(file.name, await file.text());
      actions.saveBoundary.mutate({ revierId: revier.id, geometry }, { onSuccess: () => setNotice(`Reviergrenze aus „${file.name}“ übernommen.`) });
    } catch (err) {
      setImportError(err instanceof BoundaryImportError ? err.message : 'Die Datei konnte nicht gelesen werden.');
    }
  }

  const draft = mode.kind === 'draw' ? mode.points : mode.kind === 'place' && mode.point ? [[mode.point.lng, mode.point.lat]] : undefined;

  return (
    <Page
      title={revier.name}
      actions={
        revier.groupName ? (
          <Link to="/gruppe/$groupId" params={{ groupId: revier.groupId }} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary">
            <ArrowLeft aria-hidden className="size-4" /> {revier.groupName}
          </Link>
        ) : undefined
      }
    >
      {revier.description && (
        <Card>
          <p className="whitespace-pre-line text-sm">{revier.description}</p>
        </Card>
      )}

      <MapToolbar layer={layer} onLayer={setLayer} locate={locate} onLocate={setLocate} position={position} />
      <LazyMap
        className="h-[55vh] min-h-72"
        layer={layer}
        boundaries={boundary ? [boundary] : []}
        markers={markers}
        draft={draft}
        position={ownPos}
        fit={fit}
        fitKey={`${revier.id}:${boundary?.id ?? ''}:${waypoints.length > 0}`}
        onMapClick={onMapClick}
        onMarkerClick={(id) => mode.kind === 'view' && setSelected(waypoints.find((w) => w.id === id) ?? null)}
      />

      {mode.kind === 'draw' && (
        <Card className="grid gap-3">
          <p className="text-sm">
            Tippe die Eckpunkte der Reviergrenze nacheinander in die Karte. <strong>{mode.points.length}</strong> Punkte gesetzt
            {mode.points.length < 3 ? ', mindestens 3 nötig.' : '.'}
          </p>
          <FormError message={errorText(actions.saveBoundary.error)} />
          <div className="flex flex-wrap gap-2">
            <Button disabled={mode.points.length < 3 || actions.saveBoundary.isPending} onClick={() => finishDrawing(mode.points)}>
              Grenze speichern
            </Button>
            <Button variant="secondary" disabled={mode.points.length === 0} onClick={() => setMode({ kind: 'draw', points: mode.points.slice(0, -1) })}>
              <Undo2 aria-hidden className="size-4" /> Letzten Punkt entfernen
            </Button>
            <Button variant="secondary" onClick={() => setMode({ kind: 'view' })}>
              Abbrechen
            </Button>
          </div>
        </Card>
      )}

      {mode.kind === 'place' && (
        <Card className="grid gap-3">
          <h2 className="font-semibold">Einrichtung setzen</h2>
          {mode.point ? (
            <WaypointForm
              key={`${mode.point.lat},${mode.point.lng}`}
              lat={mode.point.lat}
              lng={mode.point.lng}
              submitLabel="Einrichtung speichern"
              pending={actions.createWaypoint.isPending}
              error={actions.createWaypoint.error}
              onCancel={() => setMode({ kind: 'view' })}
              onSubmit={(input) =>
                actions.createWaypoint.mutate(
                  { revierId: revier.id, input },
                  {
                    onSuccess: (w) => {
                      setMode({ kind: 'view' });
                      setNotice(`„${w.name}“ gespeichert.`);
                    },
                  },
                )
              }
            />
          ) : (
            <>
              <p className="text-sm">Tippe in die Karte, wo die Einrichtung steht.</p>
              <div className="flex flex-wrap gap-2">
                {ownPos && (
                  <Button variant="secondary" onClick={() => setMode({ kind: 'place', point: { lat: ownPos.lat, lng: ownPos.lng } })}>
                    <MapPin aria-hidden className="size-4" /> Meinen Standort verwenden
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setMode({ kind: 'view' })}>
                  Abbrechen
                </Button>
              </div>
            </>
          )}
        </Card>
      )}

      {mode.kind === 'edit' && (
        <Card className="grid gap-3">
          <h2 className="font-semibold">Einrichtung bearbeiten</h2>
          <WaypointForm
            initial={mode.waypoint}
            lat={mode.waypoint.lat}
            lng={mode.waypoint.lng}
            submitLabel="Speichern"
            pending={actions.updateWaypoint.isPending}
            error={actions.updateWaypoint.error}
            onCancel={() => setMode({ kind: 'view' })}
            onSubmit={(input) =>
              actions.updateWaypoint.mutate(
                { waypointId: mode.waypoint.id, input },
                {
                  onSuccess: () => {
                    setMode({ kind: 'view' });
                    setSelected(null);
                    setNotice('Einrichtung gespeichert.');
                  },
                },
              )
            }
          />
        </Card>
      )}

      {mode.kind === 'view' && selected && (
        <Card className="grid gap-2">
          <div className="flex items-center gap-2">
            <span className="size-3 rounded-full" style={{ background: categoryColor(selected.category) }} />
            <h2 className="font-semibold">{selected.name}</h2>
            <Badge>{CATEGORY_LABEL[selected.category]}</Badge>
          </div>
          {selected.description && <p className="whitespace-pre-line text-sm">{selected.description}</p>}
          {canEditWaypoint(selected) && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setMode({ kind: 'edit', waypoint: selected })}>
                <Pencil aria-hidden className="size-4" /> Bearbeiten
              </Button>
              <ConfirmButton
                label="Löschen"
                confirmText={`„${selected.name}“ löschen?`}
                confirmLabel="Ja, löschen"
                onConfirm={() => actions.removeWaypoint.mutate(selected.id, { onSuccess: () => setSelected(null) })}
              />
            </div>
          )}
          <FormError message={errorText(actions.removeWaypoint.error)} />
        </Card>
      )}

      {notice && mode.kind === 'view' && <FormSuccess>{notice}</FormSuccess>}

      {mode.kind === 'view' && (
        <BoundaryCard
          revier={revier}
          permissions={permissions}
          area={boundary ? areaHectares(boundary.geometry) : null}
          onDraw={() => {
            setNotice(null);
            setSelected(null);
            setMode({ kind: 'draw', points: [] });
          }}
          onImport={() => fileInput.current?.click()}
          importError={importError ?? errorText(actions.saveBoundary.error)}
        />
      )}
      <input ref={fileInput} type="file" accept=".kml,.gpx,.geojson,.json,application/vnd.google-earth.kml+xml,application/gpx+xml,application/geo+json,application/json" className="hidden" onChange={onImport} data-testid="boundary-file" />

      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold">Einrichtungen ({waypoints.length})</h2>
          {canEdit && mode.kind === 'view' && (
            <Button
              variant="secondary"
              onClick={() => {
                setNotice(null);
                setSelected(null);
                setMode({ kind: 'place', point: null });
              }}
            >
              <MapPin aria-hidden className="size-4" /> Einrichtung setzen
            </Button>
          )}
        </div>
        {waypoints.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Hochsitze, Kirrungen oder Treffpunkte eingetragen.</p>
        ) : (
          <ul className="grid gap-1" aria-label="Einrichtungen">
            {waypoints.map((w) => (
              <li key={w.id}>
                <button type="button" onClick={() => setSelected(w)} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-sand-light/40">
                  <span className="size-3 shrink-0 rounded-full" style={{ background: categoryColor(w.category) }} />
                  <span className="min-w-0 flex-1 truncate font-medium">{w.name}</span>
                  <span className="text-sm text-muted">{CATEGORY_LABEL[w.category]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {permissions && (canEdit || permissions.canDeleteRevier) && mode.kind === 'view' && (
        <Card className="grid gap-3">
          {canEdit && (
            <Link to="/revier/$revierId/bearbeiten" params={{ revierId: revier.id }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-medium">
              <PencilLine aria-hidden className="size-4" /> Name und Beschreibung bearbeiten
            </Link>
          )}
          {permissions.canDeleteRevier && (
            <ConfirmButton
              label="Revier löschen"
              confirmText={`„${revier.name}“ mit Grenze und allen Einrichtungen endgültig löschen?`}
              confirmLabel="Endgültig löschen"
              disabled={actions.remove.isPending}
              onConfirm={() => actions.remove.mutate(revier.id, { onSuccess: () => navigate({ to: '/gruppe/$groupId', params: { groupId: revier.groupId } }) })}
            />
          )}
          <FormError message={errorText(actions.remove.error)} />
        </Card>
      )}
    </Page>
  );
}

function BoundaryCard({
  revier,
  permissions,
  area,
  onDraw,
  onImport,
  importError,
}: {
  revier: Revier;
  permissions: GroupPermissions | null;
  area: number | null;
  onDraw: () => void;
  onImport: () => void;
  importError: string | null;
}) {
  const { removeBoundary } = useRevierActions();
  const canEdit = permissions?.canEditRevier ?? false;
  return (
    <Card className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Reviergrenze</h2>
        {area != null && <span className="text-sm text-muted">ca. {hectares.format(area)} ha</span>}
      </div>
      {area == null && <p className="text-sm text-muted">Noch keine Grenze eingetragen.</p>}
      {canEdit && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onDraw}>
              <PencilLine aria-hidden className="size-4" /> {area == null ? 'Grenze zeichnen' : 'Neu zeichnen'}
            </Button>
            <Button variant="secondary" onClick={onImport}>
              <FileUp aria-hidden className="size-4" /> Datei importieren
            </Button>
          </div>
          <p className="text-xs text-muted">KML (z. B. aus Google Earth), GPX oder GeoJSON. Linien werden zu einer Fläche geschlossen.</p>
          {area != null && (
            <ConfirmButton
              label="Grenze entfernen"
              confirmText="Reviergrenze entfernen? Die Einrichtungen bleiben erhalten."
              confirmLabel="Ja, entfernen"
              onConfirm={() => removeBoundary.mutate(revier.id)}
            />
          )}
          <FormError message={importError ?? errorText(removeBoundary.error)} />
        </>
      )}
    </Card>
  );
}
