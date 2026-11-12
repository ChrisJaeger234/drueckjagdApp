import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, FileUp, MapPin, Pencil, PencilLine, Undo2 } from 'lucide-react';
import type { Position } from 'geojson';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Badge, Button, Card, ConfirmButton, Page } from '../../components/ui';
import { FormError, FormSuccess } from '../../components/form';
import { mapError } from '../../lib/errors';
import { areaHectares, bboxOf, boundaryFromFeatures, BoundaryImportError, featuresFromFile, polygonFromPoints } from '../../modules/map/geo';
import type { LayerId } from '../../modules/map/layers';
import { LazyMap } from '../../modules/map/LazyMap';
import { useOwnPosition } from '../../modules/map/useOwnPosition';
import { useUser } from '../auth/AuthContext';
import type { GroupPermissions } from '../groups/groupModel';
import { useMyGroup } from '../groups/useGroups';
import { MapToolbar, WaypointForm } from './mapControls';
import { CATEGORY_LABEL, categoryColor, waypointMarkers, type Revier, type Waypoint } from './revierModel';
import { revierImportFrom, type RevierImport } from './revierImport';
import { RevierImportCard, selectedCounts, type RevierImportSelection } from './RevierImportCard';
import { OfflineMapCard } from '../offlineMaps/OfflineMapCard';
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
  | { kind: 'edit'; waypoint: Waypoint }
  | { kind: 'import'; selection: RevierImportSelection };

function RevierView({ revier }: { revier: Revier }) {
  const user = useUser();
  const { permissions } = useMyGroup(revier.groupId);
  const ids = useMemo(() => [revier.id], [revier.id]);
  const { data: boundaries = [] } = useBoundaries(ids);
  const { data: waypoints = [] } = useWaypoints(ids);
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
  const importing = mode.kind === 'import' ? mode.selection : null;
  const markers = useMemo(() => {
    const own = waypointMarkers(waypoints);
    if (!importing) return own;
    const preview = importing.waypoints
      .filter((w) => w.use && w.action !== 'same')
      .map((w) => ({ id: `import:${w.key}`, lat: w.lat, lng: w.lng, label: w.name, color: categoryColor(w.category), ariaLabel: `Neu: ${CATEGORY_LABEL[w.category]} ${w.name}`, highlight: true }));
    return [...own, ...preview];
  }, [waypoints, importing]);
  const shownBoundaries = importing?.boundary?.use ? [{ id: 'import', geometry: importing.boundary.geometry }] : boundary ? [boundary] : [];
  const fit = useMemo(
    () =>
      importing
        ? bboxOf([importing.boundary?.geometry, ...importing.waypoints.map((w) => [w.lng, w.lat])])
        : bboxOf([...boundaries.map((b) => b.geometry), ...waypoints.map((w) => [w.lng, w.lat])]),
    [boundaries, waypoints, importing],
  );
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
    setNotice(null);
    try {
      const fc = await featuresFromFile(file);
      let result: RevierImport;
      try {
        result = revierImportFrom(fc, waypoints);
      } catch (err) {
        // Keine Fläche und keine Punkte: Linien (z. B. ein abgelaufener GPX-Track) als Grenze schließen.
        const lines = boundaryFromFeatures(fc, { closeLines: true });
        if (!lines) throw err;
        result = { boundary: lines, waypoints: [] };
      }
      if (result.waypoints.length === 0 && result.boundary) {
        const geometry = result.boundary;
        actions.saveBoundary.mutate({ revierId: revier.id, geometry }, { onSuccess: () => setNotice(`Reviergrenze aus „${file.name}“ übernommen.`) });
        return;
      }
      setSelected(null);
      actions.importFile.reset();
      setMode({
        kind: 'import',
        selection: {
          fileName: file.name,
          boundary: result.boundary ? { use: true, geometry: result.boundary, hectares: areaHectares(result.boundary) } : null,
          waypoints: result.waypoints.map((w) => ({ ...w, use: w.action !== 'same' })),
        },
      });
    } catch (err) {
      setImportError(err instanceof BoundaryImportError ? err.message : 'Die Datei konnte nicht gelesen werden.');
    }
  }

  function saveImport(selection: RevierImportSelection) {
    const chosen = selection.waypoints.filter((w) => w.use && w.action !== 'same');
    const input = (w: (typeof chosen)[number]) => ({ name: w.name, description: w.description, category: w.category, lat: w.lat, lng: w.lng });
    const { creates, updates, boundary: withBoundary } = selectedCounts(selection);
    actions.importFile.mutate(
      {
        revierId: revier.id,
        boundary: withBoundary ? selection.boundary!.geometry : null,
        creates: chosen.filter((w) => w.action === 'new').map(input),
        updates: chosen.filter((w) => w.action === 'update' && w.existingId).map((w) => ({ id: w.existingId!, input: input(w) })),
      },
      {
        onSuccess: () => {
          setMode({ kind: 'view' });
          const parts = [withBoundary ? 'Reviergrenze' : null, creates ? `${creates} neue Einrichtungen` : null, updates ? `${updates} geänderte Einrichtungen` : null].filter(Boolean);
          setNotice(`Aus „${selection.fileName}“ übernommen: ${parts.join(', ')}.`);
        },
      },
    );
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
        boundaries={shownBoundaries}
        markers={markers}
        draft={draft}
        drawing={mode.kind === 'draw'}
        position={ownPos}
        fit={fit}
        fitKey={`${revier.id}:${boundary?.id ?? ''}:${waypoints.length > 0}:${importing?.fileName ?? ''}`}
        onMapClick={onMapClick}
        onMarkerClick={(id) => mode.kind === 'view' && setSelected(waypoints.find((w) => w.id === id) ?? null)}
      />

      {mode.kind === 'import' && (
        <RevierImportCard
          selection={mode.selection}
          hasBoundary={!!boundary}
          onChange={(selection) => setMode({ kind: 'import', selection })}
          onSave={() => saveImport(mode.selection)}
          onCancel={() => setMode({ kind: 'view' })}
          pending={actions.importFile.isPending}
          error={actions.importFile.error}
        />
      )}

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
      {mode.kind === 'view' && <OfflineMapCard revierId={revier.id} name={revier.name} area={fit} />}
      <input ref={fileInput} type="file" accept=".kml,.kmz,.gpx,.geojson,.json,application/vnd.google-earth.kml+xml,application/gpx+xml,application/geo+json,application/json" className="hidden" onChange={onImport} data-testid="boundary-file" />

      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold">Einrichtungen ({waypoints.length})</h2>
          {canEdit && mode.kind === 'view' && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => fileInput.current?.click()}>
                <FileUp aria-hidden className="size-4" /> Einrichtungen importieren
              </Button>
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
            </div>
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
          <p className="text-xs text-muted">KML/KMZ (z. B. aus Google Earth oder Jagdbegleiter), GPX oder GeoJSON. Enthält die Datei auch Punkte, werden sie als Einrichtungen angeboten.</p>
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
