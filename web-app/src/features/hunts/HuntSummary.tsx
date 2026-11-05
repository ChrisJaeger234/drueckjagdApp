// Jagdzusammenfassung für die Jagdleitung: Strecke, Nachsuchen, Teilnehmer, Meldungen.
import { ClipboardList, Share2 } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card } from '../../components/ui';
import { formatHuntTime, formatReportTime } from './format';
import { HUNT_ROLES, REPORT_KINDS, type Hunt, type HuntRole, type Participant, type Report, type Stand } from './huntModel';

export interface HuntSummaryData {
  /** Strecke nach Wildart (nur „erlegt“), absteigend nach Stückzahl. */
  bag: { species: string; count: number }[];
  bagTotal: number;
  wounded: { total: number; open: number; done: number };
  missed: number;
  sightings: number;
  roles: { role: HuntRole; count: number }[];
  participants: number;
}

const speciesName = (s: string) => s.trim() || 'ohne Angabe';

export function summarize(reports: Report[], participants: Participant[]): HuntSummaryData {
  const bagMap = new Map<string, number>();
  let wounded = 0;
  let open = 0;
  let missed = 0;
  let sightings = 0;
  for (const r of reports) {
    if (r.kind === 'erlegt') bagMap.set(speciesName(r.species), (bagMap.get(speciesName(r.species)) ?? 0) + r.count);
    else if (r.kind === 'angeschossen') {
      wounded += r.count;
      if (!r.resolvedAt) open += 1;
    } else if (r.kind === 'ueberschossen') missed += r.count;
    else if (r.kind === 'anblick') sightings += r.count;
  }
  const bag = [...bagMap].map(([species, count]) => ({ species, count })).sort((a, b) => b.count - a.count || a.species.localeCompare(b.species, 'de'));
  const woundedReports = reports.filter((r) => r.kind === 'angeschossen').length;
  const roleMap = new Map<HuntRole, number>();
  participants.forEach((p) => roleMap.set(p.role, (roleMap.get(p.role) ?? 0) + 1));
  const roles = (Object.keys(HUNT_ROLES) as HuntRole[]).filter((r) => roleMap.has(r)).map((role) => ({ role, count: roleMap.get(role)! }));
  return {
    bag,
    bagTotal: bag.reduce((a, b) => a + b.count, 0),
    wounded: { total: wounded, open, done: woundedReports - open },
    missed,
    sightings,
    roles,
    participants: participants.length,
  };
}

/** Zusammenfassung als Text, z. B. zum Teilen per WhatsApp. */
export function summaryText(hunt: Hunt, data: HuntSummaryData, reports: Report[], stands: Stand[]): string {
  const standLabel = (id: string | null) => stands.find((s) => s.id === id)?.label;
  const lines = [
    `Jagdzusammenfassung: ${hunt.title}`,
    formatHuntTime(hunt.startsAt, hunt.endsAt),
    '',
    `Strecke: ${data.bagTotal === 0 ? 'keine' : data.bag.map((b) => `${b.count}× ${b.species}`).join(', ')}`,
    `Angeschossen: ${data.wounded.total}${data.wounded.total ? ` (Nachsuchen offen: ${data.wounded.open}, erledigt: ${data.wounded.done})` : ''}`,
    `Überschossen: ${data.missed} · Anblick: ${data.sightings}`,
    `Teilnehmer: ${data.participants}${data.roles.length ? ` (${data.roles.map((r) => `${r.count} ${HUNT_ROLES[r.role]}`).join(', ')})` : ''}`,
  ];
  if (reports.length) {
    lines.push('', 'Meldungen:');
    for (const r of [...reports].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) {
      const where = [standLabel(r.standId), r.reporterName].filter(Boolean).join(', ');
      lines.push(`${formatReportTime(r.occurredAt)} ${REPORT_KINDS[r.kind]}: ${r.count}× ${speciesName(r.species)}${where ? ` (${where})` : ''}${r.note ? ` – ${r.note}` : ''}`);
    }
  }
  return lines.join('\n');
}

export function HuntSummaryCard({ hunt, reports, participants, stands }: { hunt: Hunt; reports: Report[]; participants: Participant[]; stands: Stand[] }) {
  const [shared, setShared] = useState<string | null>(null);
  const data = summarize(
    reports.filter((r) => !r.pending),
    participants,
  );
  async function share() {
    const text = summaryText(hunt, data, reports.filter((r) => !r.pending), stands);
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: `Jagdzusammenfassung ${hunt.title}`, text });
        setShared(null);
      } else {
        await navigator.clipboard.writeText(text);
        setShared('In die Zwischenablage kopiert.');
      }
    } catch {
      // Teilen abgebrochen: nichts zu tun.
    }
  }
  return (
    <Card className="grid gap-3">
      <div className="flex items-center gap-2">
        <ClipboardList aria-hidden className="size-5 text-primary" />
        <h2 className="font-semibold">Jagdzusammenfassung</h2>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm" aria-label="Jagdzusammenfassung">
        <dt className="font-medium">Strecke</dt>
        <dd>
          {data.bagTotal === 0 ? (
            <span className="text-muted">noch nichts erlegt</span>
          ) : (
            <span className="flex flex-wrap gap-1">
              {data.bag.map((b) => (
                <Badge key={b.species} tone="primary">
                  {b.count}× {b.species}
                </Badge>
              ))}
            </span>
          )}
        </dd>
        <dt className="font-medium">Angeschossen</dt>
        <dd>
          {data.wounded.total}
          {data.wounded.total > 0 && (
            <span className={data.wounded.open > 0 ? 'text-danger' : 'text-muted'}>
              {' '}
              · Nachsuchen offen: {data.wounded.open}, erledigt: {data.wounded.done}
            </span>
          )}
        </dd>
        <dt className="font-medium">Überschossen</dt>
        <dd>{data.missed}</dd>
        <dt className="font-medium">Anblick</dt>
        <dd>{data.sightings}</dd>
        <dt className="font-medium">Teilnehmer</dt>
        <dd>
          {data.participants}
          {data.roles.length > 0 && <span className="text-muted"> · {data.roles.map((r) => `${r.count} ${HUNT_ROLES[r.role]}`).join(', ')}</span>}
        </dd>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => void share()}>
          <Share2 aria-hidden className="size-4" /> Zusammenfassung teilen
        </Button>
        {shared && <span className="text-sm text-muted">{shared}</span>}
      </div>
    </Card>
  );
}
