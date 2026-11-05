import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { AlertTriangle, ArrowLeft, FileUp, Flag, MapPin, PencilLine, Play, ShieldAlert, Trash2, Undo2, X } from 'lucide-react';
import type { Position } from 'geojson';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Badge, Button, Card, ConfirmButton, Page } from '../../components/ui';
import { Field, FormError, FormSuccess } from '../../components/form';
import { mapError } from '../../lib/errors';
import { bboxOf, BoundaryImportError, featuresFromFile, polygonFromPoints } from '../../modules/map/geo';
import type { LayerId } from '../../modules/map/layers';
import { LazyMap } from '../../modules/map/LazyMap';
import type { MapMarker } from '../../modules/map/MapView';
import { useOwnPosition } from '../../modules/map/useOwnPosition';
import { useUser } from '../auth/AuthContext';
import { useMyGroup } from '../groups/useGroups';
import { OfflineMapHint } from '../offlineMaps/OfflineMapHint';
import { MapToolbar } from '../reviere/mapControls';
import { useBoundaries, useWaypoints } from '../reviere/useReviere';
import { categoryColor, type Waypoint, type WaypointCategory } from '../reviere/revierModel';
import { HuntSummaryCard } from './HuntSummary';
import { RevierWaypointsCard, StandCategorySelect, StandFromWaypointCard } from './StandFromWaypoint';
import { formatHuntTime } from './format';
import { ParticipantsCard, ReportsCard, StandsCard, ZonesCard, MyParticipation, ReportButtons } from './huntSections';
import { StatusBadge } from './HuntList';
import { huntPermissions, isOpenFollowUp, livePermissions, ZONE_KINDS, zoneColor, type Hunt, type ZoneKind } from './huntModel';
import { useHunt, useHuntActions, useHuntDetails, useHuntPositions } from './useHunts';
import { LiveCard, liveMarkers } from '../live/LiveCard';
import { huntImportFrom } from './huntImport';
import { countText, HuntImportCard, STAND_PREVIEW_COLOR, type ImportSelection } from './HuntImportCard';

const errorText = (e: unknown) => (e ? mapError(e).message : null);

export function HuntPage() {
  const { huntId } = useParams({ from: '/shell/jagd/$huntId' });
  const { data: hunt, error } = useHunt(huntId);
  if (!hunt) {
    return <Page title="Jagd">{error ? <FormError message={errorText(error)} /> : <p className="text-sm text-muted">Jagd wird geladen …</p>}</Page>;
  }
  return <HuntView hunt={hunt} />;
}

type Mode =
  | { kind: 'view' }
  | { kind: 'stand'; point: { lat: number; lng: number } | null }
  | { kind: 'zone'; points: Position[] }
  | { kind: 'import'; fileName: string; selection: ImportSelection }
  | { kind: 'adopt'; waypoint: Waypoint };

const IMPORT_ACCEPT = '.kml,.kmz,.gpx,.geojson,.json,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,application/gpx+xml,application/geo+json,application/json';

function HuntView({ hunt }: { hunt: Hunt }) {
  const user = useUser();
  const { data: mine } = useMyGroup(hunt.groupId);
  const { participants, stands, zones, reports } = useHuntDetails(hunt.id);
  const actions = useHuntActions(hunt.id);
  const navigate = useNavigate();
  const revierIds = useMemo(() => (hunt.revierId ? [hunt.revierId] : []), [hunt.revierId]);
  const { data: boundaries = [] } = useBoundaries(revierIds);
  const { data: revierWaypoints = [] } = useWaypoints(revierIds);

  const people = useMemo(() => participants.data ?? [], [participants.data]);
  const standList = useMemo(() => stands.data ?? [], [stands.data]);
  const zoneList = useMemo(() => zones.data ?? [], [zones.data]);
  const reportList = useMemo(() => reports.data ?? [], [reports.data]);
  const me = people.find((p) => p.userId === user.id) ?? null;
  const perms = huntPermissions(user.id, mine?.role ?? null, me);
  const live = livePermissions(hunt, mine?.role ?? null, me);
  const { data: positions = [] } = useHuntPositions(hunt.id, live.canView);

  const [layer, setLayer] = useState<LayerId>('karte');
  const [locate, setLocate] = useState(false);
  const position = useOwnPosition(locate);
  const ownPos = position.status === 'ok' ? position.position : null;
  const [mode, setMode] = useState<Mode>({ kind: 'view' });
  const [notice, setNotice] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const importing = mode.kind === 'import' ? mode.selection : null;

  async function onImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setNotice(null);
    setImportError(null);
    actions.importMap.reset();
    try {
      const found = huntImportFrom(await featuresFromFile(file), standList.map((s) => s.label));
      setMode({
        kind: 'import',
        fileName: file.name,
        selection: { zones: found.zones.map((z) => ({ ...z, use: true })), stands: found.stands.map((s) => ({ ...s, use: !s.duplicate })) },
      });
    } catch (err) {
      setImportError(err instanceof BoundaryImportError ? err.message : 'Die Datei konnte nicht gelesen werden.');
    }
  }

  function saveImport(sel: ImportSelection) {
    const zones = sel.zones.filter((z) => z.use).map((z) => ({ name: z.name, kind: z.kind, geometry: z.geometry, color: z.color }));
    const stands = sel.stands.filter((s) => s.use && !s.duplicate).map((s) => ({ label: s.label, lat: s.lat, lng: s.lng, waypointId: null, category: s.category, description: '' }));
    actions.importMap.mutate(
      { zones, stands },
      {
        onSuccess: () => {
          setMode({ kind: 'view' });
          setNotice(`${countText(zones.length, stands.length)} übernommen.`);
        },
      },
    );
  }

  // Einrichtungen des Reviers, die in dieser Jagd noch kein Stand sind.
  const freeWaypoints = useMemo(() => revierWaypoints.filter((w) => !standList.some((s) => s.waypointId === w.id)), [revierWaypoints, standList]);
  const markers: MapMarker[] = useMemo(
    () => [
      ...standList.map((s) => {
        const names = people.filter((p) => p.standId === s.id).map((p) => p.name);
        return {
          id: s.id,
          lat: s.lat,
          lng: s.lng,
          label: names.length ? `${s.label} · ${names.join(', ')}` : s.label,
          color: s.category ? categoryColor(s.category) : '#7a4a1f',
          ariaLabel: `Stand ${s.label}`,
          highlight: me?.standId === s.id,
        };
      }),
      ...freeWaypoints.map((w) => ({ id: `wp:${w.id}`, lat: w.lat, lng: w.lng, label: w.name, color: '#9e9e9e', ariaLabel: `Einrichtung ${w.name}` })),
      ...(live.canView ? liveMarkers(positions, people, user.id) : []),
      ...(importing?.stands ?? [])
        .filter((s) => s.use && !s.duplicate)
        .map((s) => ({ id: `import-${s.key}`, lat: s.lat, lng: s.lng, label: s.label, color: STAND_PREVIEW_COLOR, ariaLabel: `Neuer Stand ${s.label}` })),
    ],
    [standList, people, me?.standId, live.canView, positions, user.id, importing, freeWaypoints],
  );
  const areas = useMemo(
    () => [
      ...zoneList.map((z) => ({ id: z.id, geometry: z.geometry, color: zoneColor(z) })),
      ...(importing?.zones ?? []).filter((z) => z.use).map((z) => ({ id: `import-${z.key}`, geometry: z.geometry, color: zoneColor(z) })),
    ],
    [zoneList, importing],
  );
  const fit = useMemo(
    () =>
      importing
        ? bboxOf([...importing.zones.map((z) => z.geometry), ...importing.stands.map((s) => [s.lng, s.lat])])
        : bboxOf([...boundaries.map((b) => b.geometry), ...zoneList.map((z) => z.geometry), ...standList.map((s) => [s.lng, s.lat])]),
    [importing, boundaries, zoneList, standList],
  );
  const openFollowUps = reportList.filter(isOpenFollowUp);
  const myStand = standList.find((s) => s.id === me?.standId) ?? null;

  function onMapClick({ lng, lat }: { lng: number; lat: number }) {
    if (mode.kind === 'stand') setMode({ kind: 'stand', point: { lat, lng } });
    else if (mode.kind === 'zone') setMode({ kind: 'zone', points: [...mode.points, [lng, lat]] });
  }
  function onMarkerClick(id: string) {
    if (!perms.canManage || (mode.kind !== 'view' && mode.kind !== 'adopt') || !id.startsWith('wp:')) return;
    const waypoint = freeWaypoints.find((w) => `wp:${w.id}` === id);
    if (waypoint) startMode({ kind: 'adopt', waypoint });
  }
  function adopt(waypoint: Waypoint, label: string, category: WaypointCategory | null) {
    actions.createStand.mutate(
      { label, lat: waypoint.lat, lng: waypoint.lng, waypointId: waypoint.id, category, description: '' },
      {
        onSuccess: () => {
          setMode({ kind: 'view' });
          setNotice(`${label} als Stand übernommen.`);
        },
      },
    );
  }
  const startMode = (m: Mode) => {
    actions.createStand.reset();
    setNotice(null);
    setImportError(null);
    setMode(m);
  };
  const draft = mode.kind === 'zone' ? mode.points : mode.kind === 'stand' && mode.point ? [[mode.point.lng, mode.point.lat]] : undefined;

  return (
    <Page
      title={hunt.title}
      actions={
        <Link to="/gruppe/$groupId" params={{ groupId: hunt.groupId }} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary">
          <ArrowLeft aria-hidden className="size-4" /> {hunt.groupName ?? 'Gruppe'}
        </Link>
      }
    >
      <Card className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge hunt={hunt} />
          <span className="text-sm">{formatHuntTime(hunt.startsAt, hunt.endsAt)}</span>
        </div>
        {hunt.revierId && hunt.revierName && (
          <p className="text-sm">
            Revier:{' '}
            <Link to="/revier/$revierId" params={{ revierId: hunt.revierId }} className="font-medium text-primary">
              {hunt.revierName}
            </Link>
          </p>
        )}
        {hunt.revierId && <OfflineMapHint revierId={hunt.revierId} />}
        {hunt.meetingPoint && <Info label="Treffpunkt" text={hunt.meetingPoint} />}
        {hunt.gameRelease && <Info label="Freigabe" text={hunt.gameRelease} />}
        {hunt.description && <p className="whitespace-pre-line text-sm">{hunt.description}</p>}
      </Card>

      {(hunt.safetyNotes || hunt.emergencyInfo) && (
        <Card className="grid gap-2 border-signal/60">
          {hunt.safetyNotes && (
            <div className="flex gap-2">
              <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-signal" />
              <Info label="Sicherheit" text={hunt.safetyNotes} />
            </div>
          )}
          {hunt.emergencyInfo && (
            <div className="flex gap-2">
              <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
              <Info label="Notfall" text={hunt.emergencyInfo} />
            </div>
          )}
        </Card>
      )}

      {openFollowUps.length > 0 && (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-danger px-3 py-2 text-sm font-medium text-white">
          <AlertTriangle aria-hidden className="size-4" />
          {openFollowUps.length === 1 ? '1 offene Nachsuche' : `${openFollowUps.length} offene Nachsuchen`}
        </p>
      )}

      <MyParticipation hunt={hunt} me={me} myStand={myStand} zones={zoneList} perms={perms} actions={actions} />

      <LiveCard hunt={hunt} me={me} people={people} positions={positions} live={live} />

      {perms.canReport && isOpenOrRecent(hunt) && <ReportButtons huntId={hunt.id} stands={standList} myStandId={me?.standId ?? null} ownPos={ownPos} actions={actions} />}

      <MapToolbar layer={layer} onLayer={setLayer} locate={locate} onLocate={setLocate} position={position} />
      <LazyMap
        className="h-[55vh] min-h-72"
        layer={layer}
        boundaries={boundaries}
        areas={areas}
        markers={markers}
        draft={draft}
        position={ownPos}
        fit={fit}
        fitKey={mode.kind === 'import' ? `import:${mode.fileName}` : `${hunt.id}:${boundaries.length}:${zoneList.length > 0}:${standList.length > 0}`}
        onMapClick={onMapClick}
        onMarkerClick={onMarkerClick}
      />

      {mode.kind === 'stand' && (
        <Card className="grid gap-3">
          <h2 className="font-semibold">Stand setzen</h2>
          {mode.point ? (
            <StandForm
              key={`${mode.point.lat},${mode.point.lng}`}
              suggested={`Stand ${standList.length + 1}`}
              pending={actions.createStand.isPending}
              error={actions.createStand.error}
              onCancel={() => setMode({ kind: 'view' })}
              onSubmit={(label, category) =>
                actions.createStand.mutate(
                  { label, lat: mode.point!.lat, lng: mode.point!.lng, waypointId: null, category, description: '' },
                  {
                    onSuccess: () => {
                      setMode({ kind: 'view' });
                      setNotice(`${label} gesetzt.`);
                    },
                  },
                )
              }
            />
          ) : (
            <>
              <p className="text-sm">Tippe in die Karte, wo der Stand ist.</p>
              <div className="flex flex-wrap gap-2">
                {ownPos && (
                  <Button variant="secondary" onClick={() => setMode({ kind: 'stand', point: { lat: ownPos.lat, lng: ownPos.lng } })}>
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

      {mode.kind === 'zone' && (
        <ZoneDrawCard
          points={mode.points}
          onUndo={() => setMode({ kind: 'zone', points: mode.points.slice(0, -1) })}
          onCancel={() => setMode({ kind: 'view' })}
          pending={actions.createZone.isPending}
          error={actions.createZone.error}
          onSave={(name, kind) => {
            const polygon = polygonFromPoints(mode.points);
            if (!polygon) return;
            actions.createZone.mutate(
              { name, kind, geometry: polygon },
              {
                onSuccess: () => {
                  setMode({ kind: 'view' });
                  setNotice(`${ZONE_KINDS[kind]} „${name}“ gespeichert.`);
                },
              },
            );
          }}
        />
      )}

      {mode.kind === 'adopt' && (
        <StandFromWaypointCard
          key={mode.waypoint.id}
          waypoint={mode.waypoint}
          pending={actions.createStand.isPending}
          error={actions.createStand.error}
          onSave={(label, category) => adopt(mode.waypoint, label, category)}
          onCancel={() => setMode({ kind: 'view' })}
        />
      )}

      {mode.kind === 'import' && (
        <HuntImportCard
          fileName={mode.fileName}
          selection={mode.selection}
          onChange={(selection) => setMode({ ...mode, selection })}
          onSave={() => saveImport(mode.selection)}
          onCancel={() => setMode({ kind: 'view' })}
          pending={actions.importMap.isPending}
          error={actions.importMap.error}
        />
      )}

      {notice && mode.kind === 'view' && <FormSuccess>{notice}</FormSuccess>}

      {mode.kind === 'view' && perms.canManage && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => startMode({ kind: 'stand', point: null })}>
            <MapPin aria-hidden className="size-4" /> Stand setzen
          </Button>
          <Button variant="secondary" onClick={() => startMode({ kind: 'zone', points: [] })}>
            <PencilLine aria-hidden className="size-4" /> Zone zeichnen
          </Button>
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>
            <FileUp aria-hidden className="size-4" /> Karte importieren
          </Button>
        </div>
      )}
      {mode.kind === 'view' && perms.canManage && <p className="-mt-2 text-xs text-muted">Import aus KML/KMZ (z. B. Google My Maps oder Google Earth), GPX oder GeoJSON: Flächen werden Zonen, Punkte werden Stände.</p>}
      {mode.kind === 'view' && <FormError message={importError} />}
      {perms.canManage && <input ref={fileInput} type="file" accept={IMPORT_ACCEPT} className="hidden" onChange={(e) => void onImportFile(e)} data-testid="hunt-import-file" />}

      <StandsCard stands={standList} participants={people} perms={perms} actions={actions} />
      {perms.canManage && mode.kind === 'view' && <RevierWaypointsCard waypoints={freeWaypoints} onPick={(w) => startMode({ kind: 'adopt', waypoint: w })} />}
      <ZonesCard zones={zoneList} perms={perms} actions={actions} />
      <ParticipantsCard hunt={hunt} participants={people} stands={standList} zones={zoneList} perms={perms} actions={actions} userId={user.id} />
      {perms.canManage && (hunt.status === 'laufend' || hunt.status === 'beendet') && (
        <HuntSummaryCard hunt={hunt} reports={reportList} participants={people} stands={standList} />
      )}
      <ReportsCard reports={reportList} stands={standList} perms={perms} actions={actions} />

      {perms.canManage && (
        <Card className="grid gap-3">
          <h2 className="font-semibold">Jagdleitung</h2>
          <div className="flex flex-wrap gap-2">
            <Link to="/jagd/$huntId/bearbeiten" params={{ huntId: hunt.id }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-medium">
              <PencilLine aria-hidden className="size-4" /> Bearbeiten
            </Link>
            {hunt.status === 'geplant' && (
              <Button onClick={() => actions.setStatus.mutate('laufend')}>
                <Play aria-hidden className="size-4" /> Jagd starten
              </Button>
            )}
            {hunt.status === 'laufend' && (
              <Button onClick={() => actions.setStatus.mutate('beendet')}>
                <Flag aria-hidden className="size-4" /> Jagd beenden
              </Button>
            )}
            {(hunt.status === 'beendet' || hunt.status === 'abgesagt') && (
              <Button variant="secondary" onClick={() => actions.setStatus.mutate('geplant')}>
                <Undo2 aria-hidden className="size-4" /> Wieder öffnen
              </Button>
            )}
          </div>
          {hunt.status === 'geplant' && (
            <ConfirmButton
              label={
                <>
                  <X aria-hidden className="size-4" /> Jagd absagen
                </>
              }
              confirmText="Jagd absagen? Teilnehmer und Stände bleiben erhalten."
              confirmLabel="Ja, absagen"
              onConfirm={() => actions.setStatus.mutate('abgesagt')}
            />
          )}
          {perms.canDelete && (
            <ConfirmButton
              label={
                <>
                  <Trash2 aria-hidden className="size-4" /> Jagd löschen
                </>
              }
              confirmText="Die Jagd mit allen Ständen, Zonen, Teilnehmern und Meldungen endgültig löschen?"
              confirmLabel="Endgültig löschen"
              onConfirm={() => actions.remove.mutate(undefined, { onSuccess: () => navigate({ to: '/gruppe/$groupId', params: { groupId: hunt.groupId } }) })}
            />
          )}
          <FormError message={errorText(actions.setStatus.error) ?? errorText(actions.remove.error)} />
        </Card>
      )}
    </Page>
  );
}

/** Meldungen sind während und kurz nach der Jagd sinnvoll, bei abgesagten Jagden nicht. */
const isOpenOrRecent = (h: Hunt) => h.status !== 'abgesagt';

function Info({ label, text }: { label: string; text: string }) {
  return (
    <p className="whitespace-pre-line text-sm">
      <span className="font-medium">{label}: </span>
      {text}
    </p>
  );
}

function StandForm({
  suggested,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  suggested: string;
  pending: boolean;
  error: unknown;
  onSubmit: (label: string, category: WaypointCategory | null) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(suggested);
  const [category, setCategory] = useState<WaypointCategory | null>(null);
  const invalid = label.trim().length === 0 || label.trim().length > 60;
  return (
    <form
      noValidate
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid) onSubmit(label, category);
      }}
    >
      <Field label="Bezeichnung" value={label} onChange={(e) => setLabel(e.target.value)} error={invalid ? 'Bitte gib eine Bezeichnung mit bis zu 60 Zeichen ein.' : undefined} />
      <StandCategorySelect value={category} onChange={setCategory} />
      <FormError message={errorText(error)} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || invalid}>
          Stand speichern
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

function ZoneDrawCard({
  points,
  onUndo,
  onCancel,
  onSave,
  pending,
  error,
}: {
  points: Position[];
  onUndo: () => void;
  onCancel: () => void;
  onSave: (name: string, kind: ZoneKind) => void;
  pending: boolean;
  error: unknown;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ZoneKind>('treiben');
  const ready = points.length >= 3 && name.trim().length > 0;
  return (
    <Card className="grid gap-3">
      <h2 className="font-semibold">Zone zeichnen</h2>
      <p className="text-sm">
        Tippe die Eckpunkte in die Karte. <strong>{points.length}</strong> Punkte gesetzt{points.length < 3 ? ', mindestens 3 nötig.' : '.'}
      </p>
      <label className="grid gap-1 text-sm font-medium">
        Art
        <select value={kind} onChange={(e) => setKind(e.target.value as ZoneKind)} className="min-h-11 rounded-xl border border-line bg-surface px-3 font-normal">
          {(Object.keys(ZONE_KINDS) as ZoneKind[]).map((k) => (
            <option key={k} value={k}>
              {ZONE_KINDS[k]}
            </option>
          ))}
        </select>
      </label>
      <Field label="Name der Zone" placeholder="z. B. Treiben 1 Eichenhang" value={name} onChange={(e) => setName(e.target.value)} />
      <FormError message={errorText(error)} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={!ready || pending} onClick={() => onSave(name, kind)}>
          Zone speichern
        </Button>
        <Button variant="secondary" disabled={points.length === 0} onClick={onUndo}>
          <Undo2 aria-hidden className="size-4" /> Letzten Punkt entfernen
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {(Object.keys(ZONE_KINDS) as ZoneKind[]).map((k) => (
          <Badge key={k}>
            <span className="mr-1 inline-block size-2 rounded-full" style={{ background: zoneColor({ kind: k, color: null }) }} />
            {ZONE_KINDS[k]}
          </Badge>
        ))}
      </div>
    </Card>
  );
}
