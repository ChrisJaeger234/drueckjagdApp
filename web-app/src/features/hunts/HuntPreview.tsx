import { Eye, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Card } from "../../components/ui";
import type { LayerId } from "../../modules/map/layers";
import { LazyMap } from "../../modules/map/LazyMap";
import type { MapMarker } from "../../modules/map/MapView";
import { bboxOf } from "../../modules/map/geo";
import { MapToolbar } from "../reviere/mapControls";
import { useOwnPosition } from "../../modules/map/useOwnPosition";
import { categoryColor, type RevierBoundary } from "../reviere/revierModel";
import {
  ReportButtons,
  ReportsCard,
  StandsCard,
  ZonesCard,
} from "./huntSections";
import {
  HUNT_ROLES,
  huntPermissions,
  ZONE_KINDS,
  zoneColor,
  zoneIdsOf,
  hidesStandNames,
  type ExtraZone,
  type Phase,
  type Hunt,
  type HuntRole,
  type Participant,
  type Report,
  type Stand,
  type Zone,
} from "./huntModel";
import type { useHuntActions } from "./useHunts";
import { ZoneLegend } from "./ZoneLegend";

type HuntActions = ReturnType<typeof useHuntActions>;

/** Rollen, die ohne passenden Teilnehmer als „Beispiel“ angeboten werden. */
const SAMPLE_ROLES: HuntRole[] = ["schuetze", "treiber", "hundefuehrer"];

/**
 * Vorschau für die Planung: zeigt die Jagd so, wie ein Teilnehmer sie während der Jagd sieht.
 * Nichts wird gespeichert; Meldungen werden nur simuliert, Einrichtungen des Reviers sind ausgeblendet.
 */
export function HuntPreview({
  hunt,
  people,
  stands,
  zones,
  extras = [],
  phase = null,
  reports,
  boundaries,
  actions,
  onClose,
}: {
  hunt: Hunt;
  people: Participant[];
  stands: Stand[];
  zones: Zone[];
  extras?: ExtraZone[];
  phase?: Phase | null;
  reports: Report[];
  boundaries: RevierBoundary[];
  actions: HuntActions;
  onClose: () => void;
}) {
  const choices = useMemo(
    () => [
      ...people
        .filter((p) => p.role !== "jagdleiter")
        .map((p) => ({
          key: p.id,
          label: `${p.name} (${HUNT_ROLES[p.role]})`,
          person: p,
        })),
      ...SAMPLE_ROLES.map((r) => ({
        key: `beispiel:${r}`,
        label: `Beispiel: ${HUNT_ROLES[r]} ohne Stand`,
        person: {
          id: `beispiel:${r}`,
          huntId: hunt.id,
          userId: `beispiel:${r}`,
          role: r,
          standId: null,
          zoneId: null,
          note: "",
          name: HUNT_ROLES[r],
        } satisfies Participant,
      })),
    ],
    [people, hunt.id],
  );
  const [key, setKey] = useState(
    () =>
      (choices.find((c) => c.person.role === "schuetze") ?? choices[0])!.key,
  );
  const viewer = (choices.find((c) => c.key === key) ?? choices[0])!.person;
  const myStand = stands.find((s) => s.id === viewer.standId) ?? null;
  const myZones = zoneIdsOf(viewer.zoneId, extras, viewer.id, hunt.currentPhaseId ?? null, zones).map((id) => zones.find((z) => z.id === id)!);
  // Teilnehmer ohne Gruppenrolle-Rechte: alles nur lesen.
  const perms = huntPermissions(viewer.userId, null, viewer);

  const [layer, setLayer] = useState<LayerId>("karte");
  const [locate, setLocate] = useState(false);
  const position = useOwnPosition(locate);

  const markers: MapMarker[] = stands.map((s) => {
    const names = people.filter((p) => p.standId === s.id).map((p) => p.name);
    return {
      id: s.id,
      lat: s.lat,
      lng: s.lng,
      label: names.length ? `${s.label} · ${names.join(", ")}` : s.label,
      color: s.category ? categoryColor(s.category) : "#7a4a1f",
      ariaLabel: `Stand ${s.label}`,
      highlight: s.id === viewer.standId,
      hideLabel: hidesStandNames(viewer.role) && s.id !== viewer.standId,
    };
  });
  const areas = zones.map((z) => ({
    id: z.id,
    geometry: z.geometry,
    color: zoneColor(z),
    highlight: myZones.some((m) => m.id === z.id),
  }));
  const fit = bboxOf([
    ...boundaries.map((b) => b.geometry),
    ...zones.map((z) => z.geometry),
    ...stands.map((s) => [s.lng, s.lat]),
  ]);

  return (
    <>
      <section aria-label="Vorschau">
        <Card className="grid gap-3 border-primary bg-primary/5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <Eye aria-hidden className="size-5" /> Vorschau: Jagd läuft
            </h2>
            <Button variant="secondary" onClick={onClose}>
              <X aria-hidden className="size-4" /> Vorschau beenden
            </Button>
          </div>
          <p className="text-sm text-muted">
            So sieht ein Teilnehmer die Jagd, sobald sie gestartet ist. In der
            Vorschau wird nichts gespeichert oder gesendet.
          </p>
          <label className="grid gap-1 text-sm font-medium">
            Ansicht als
            <select
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="min-h-11 rounded-xl border border-line bg-surface px-3 font-normal"
            >
              {choices.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </Card>
      </section>

      <Card className="grid gap-2 border-primary/40 bg-sand-light/30">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Du bist dabei als</h2>
          <Badge tone="primary">{HUNT_ROLES[viewer.role]}</Badge>
        </div>
        {myStand ? (
          <p className="text-lg font-semibold">Dein Stand: {myStand.label}</p>
        ) : viewer.role === "schuetze" ? (
          <p className="text-sm text-muted">Noch kein Stand zugeteilt.</p>
        ) : null}
        {myZones.length > 0 && (
          <p className="text-sm">
            {myZones.length === 1 ? "Deine Zone" : "Deine Zonen"} (in der Karte
            hervorgehoben):{" "}
            {myZones.map((z, i) => (
              <span key={z.id}>
                {i > 0 && ", "}
                <span className="font-medium">{z.name}</span> (
                {ZONE_KINDS[z.kind]})
              </span>
            ))}
          </p>
        )}
      </Card>

      <ReportButtons
        huntId={hunt.id}
        stands={stands}
        myStandId={viewer.standId}
        ownPos={null}
        actions={actions}
        preview
      />

      <MapToolbar
        layer={layer}
        onLayer={setLayer}
        locate={locate}
        onLocate={setLocate}
        position={position}
      />
      <LazyMap
        className="h-[55vh] min-h-72"
        layer={layer}
        boundaries={boundaries}
        areas={areas}
        markers={markers}
        fit={fit}
        fitKey={`vorschau:${hunt.id}`}
      />
      <ZoneLegend
        zones={zones}
        people={people}
        extras={extras}
        phase={phase}
        viewer={viewer}
        myZoneIds={myZones.map((z) => z.id)}
      />

      <StandsCard
        stands={stands}
        participants={people}
        perms={perms}
        actions={actions}
      />
      <ZonesCard zones={zones} perms={perms} actions={actions} />
      <ReportsCard
        reports={reports}
        stands={stands}
        perms={perms}
        actions={actions}
      />
    </>
  );
}
