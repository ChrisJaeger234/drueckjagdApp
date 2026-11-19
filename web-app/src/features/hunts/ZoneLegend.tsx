// Legende unter der Karte: Zonen der aktiven Phase, wer dort eingeteilt ist, und die eigene Rolle.
import { Badge, CollapsibleCard } from '../../components/ui';
import { HUNT_ROLES, ZONE_KINDS, zoneColor, zoneIdsOf, type ExtraZone, type Participant, type Phase, type Zone } from './huntModel';

export function ZoneLegend({
  zones,
  people,
  extras,
  phase,
  viewer,
  myZoneIds,
}: {
  zones: Zone[];
  people: Participant[];
  extras: ExtraZone[];
  /** Aktive Phase, null = Jagd ohne Phasen. */
  phase: Phase | null;
  /** Wer die Karte ansieht; null = nicht eingetragen. */
  viewer: Participant | null;
  myZoneIds: string[];
}) {
  if (zones.length === 0) return null;
  const phaseId = phase?.id ?? null;
  const zoneIdsByPerson = new Map(people.map((p) => [p.id, zoneIdsOf(p.zoneId, extras, p.id, phaseId, zones)]));
  // Eigene Zonen zuerst, danach wie in der Zonenliste.
  const ordered = [...zones].sort((a, b) => Number(myZoneIds.includes(b.id)) - Number(myZoneIds.includes(a.id)));
  const mine = myZoneIds.map((id) => zones.find((z) => z.id === id)).filter((z): z is Zone => !!z);
  return (
    <CollapsibleCard title={`Zonen${phase ? ` in ${phase.name}` : ''}`} label="Legende" storageKey="jagd-legende">
      {viewer && (
        <p className="rounded-xl bg-sand-light/40 px-3 py-2 text-sm" data-testid="legend-me">
          Du bist <span className="font-semibold">{HUNT_ROLES[viewer.role]}</span>
          {mine.length > 0 ? (
            <>
              {' · '}
              {mine.length === 1 ? 'Zone' : 'Zonen'}: <span className="font-semibold">{mine.map((z) => z.name).join(', ')}</span>
            </>
          ) : viewer.role !== 'schuetze' ? (
            ' · keine Zone zugeteilt'
          ) : null}
        </p>
      )}
      <ul className="grid gap-2" aria-label="Legende">
        {ordered.map((z) => {
          const own = myZoneIds.includes(z.id);
          const names = people.filter((p) => zoneIdsByPerson.get(p.id)?.includes(z.id)).map((p) => p.name);
          return (
            <li key={z.id} className={`flex items-start gap-2 rounded-xl p-1.5 ${own ? 'bg-primary/10 ring-2 ring-primary' : ''}`}>
              <span className="mt-0.5 size-4 shrink-0 rounded-sm border border-black/10" style={{ background: zoneColor(z) }} />
              <span className="grid flex-1 gap-0.5 text-sm">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{z.name}</span>
                  <span className="text-muted">{ZONE_KINDS[z.kind]}</span>
                  {own && <Badge tone="primary">deine Zone</Badge>}
                </span>
                {names.length > 0 && <span className="text-xs text-muted">{names.join(', ')}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </CollapsibleCard>
  );
}
