import { CheckCircle2, Crosshair, Eye, MessageSquare, RotateCcw, Trash2, UserPlus, XCircle } from 'lucide-react';
import { onlineManager } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Badge, Button, Card, ConfirmButton } from '../../components/ui';
import { Field, FormError, FormSuccess } from '../../components/form';
import { mapError } from '../../lib/errors';
import type { OwnPosition } from '../../modules/map/MapView';
import { memberLabel } from '../groups/groupModel';
import { useMembers } from '../groups/useGroups';
import { formatReportTime } from './format';
import {
  COMMON_SPECIES,
  HUNT_ROLES,
  isLeadRole,
  needsFollowUp,
  newReport,
  REPORT_KINDS,
  SELF_ASSIGNABLE_ROLES,
  ZONE_KINDS,
  zoneColor,
  type Hunt,
  type HuntPermissions,
  type HuntRole,
  type Participant,
  type Report,
  type ReportInput,
  type ReportKind,
  type Stand,
  type Zone,
} from './huntModel';
import type { HuntActions } from './useHunts';
import { CATEGORY_LABEL } from '../reviere/revierModel';

const errorText = (e: unknown) => (e ? mapError(e).message : null);
const select = 'min-h-10 rounded-xl border border-line bg-surface px-2 text-sm';

// ------------------------------------------------------------ eigene Teilnahme

export function MyParticipation({
  hunt,
  me,
  myStand,
  zones,
  perms,
  actions,
}: {
  hunt: Hunt;
  me: Participant | null;
  myStand: Stand | null;
  zones: Zone[];
  perms: HuntPermissions;
  actions: HuntActions;
}) {
  const [role, setRole] = useState<HuntRole>('schuetze');
  if (!me) {
    if (!perms.canSelfJoin(hunt)) {
      return hunt.selfJoin ? null : (
        <Card>
          <p className="text-sm text-muted">Die Jagdleitung trägt die Teilnehmer ein.</p>
        </Card>
      );
    }
    return (
      <Card className="grid gap-3">
        <h2 className="font-semibold">Teilnehmen</h2>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          Als
          <select aria-label="Meine Rolle" value={role} onChange={(e) => setRole(e.target.value as HuntRole)} className={select}>
            {SELF_ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {HUNT_ROLES[r]}
              </option>
            ))}
          </select>
          <Button disabled={actions.join.isPending} onClick={() => actions.join.mutate(role)}>
            <UserPlus aria-hidden className="size-4" /> Eintragen
          </Button>
        </label>
        <FormError message={errorText(actions.join.error)} />
      </Card>
    );
  }
  const zone = zones.find((z) => z.id === me.zoneId);
  return (
    <Card className="grid gap-2 border-primary/40 bg-sand-light/30">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Du bist dabei als</h2>
        <Badge tone="primary">{HUNT_ROLES[me.role]}</Badge>
      </div>
      {myStand ? (
        <p className="text-lg font-semibold">Dein Stand: {myStand.label}</p>
      ) : me.role === 'schuetze' ? (
        <p className="text-sm text-muted">Noch kein Stand zugeteilt.</p>
      ) : null}
      {zone && (
        <p className="text-sm">
          Zone: <span className="font-medium">{zone.name}</span> ({ZONE_KINDS[zone.kind]})
        </p>
      )}
      {!isLeadRole(me.role) && (
        <label className="flex flex-wrap items-center gap-2 text-sm">
          Rolle ändern
          <select
            aria-label="Meine Rolle ändern"
            value={me.role}
            onChange={(e) => actions.updateParticipant.mutate({ id: me.id, role: e.target.value as HuntRole })}
            className={select}
          >
            {SELF_ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {HUNT_ROLES[r]}
              </option>
            ))}
          </select>
        </label>
      )}
      <ConfirmButton label="Austragen" confirmText="Aus dieser Jagd austragen?" confirmLabel="Ja, austragen" onConfirm={() => actions.removeParticipant.mutate(me.id)} />
      <FormError message={errorText(actions.updateParticipant.error) ?? errorText(actions.removeParticipant.error)} />
    </Card>
  );
}

// ------------------------------------------------------------ Meldung abgeben

const REPORT_ICONS: Record<ReportKind, typeof Crosshair> = {
  erlegt: CheckCircle2,
  angeschossen: Crosshair,
  ueberschossen: XCircle,
  anblick: Eye,
  sonstiges: MessageSquare,
};

export function ReportButtons({
  huntId,
  stands,
  myStandId,
  ownPos,
  actions,
  preview = false,
}: {
  huntId: string;
  stands: Stand[];
  myStandId: string | null;
  ownPos: OwnPosition | null;
  actions: HuntActions;
  /** Vorschau der Planung: Meldungen werden nicht gesendet. */
  preview?: boolean;
}) {
  const [kind, setKind] = useState<ReportKind | null>(null);
  const [done, setDone] = useState<string | null>(null);
  return (
    <Card className="grid gap-3">
      <h2 className="font-semibold">Meldung</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(['erlegt', 'angeschossen', 'ueberschossen', 'anblick'] as const).map((k) => {
          const Icon = REPORT_ICONS[k];
          return (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => {
                setDone(null);
                setKind(kind === k ? null : k);
              }}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border text-sm font-medium ${
                kind === k ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface'
              }`}
            >
              <Icon aria-hidden className={`size-5 ${k === 'angeschossen' && kind !== k ? 'text-danger' : ''}`} />
              {REPORT_KINDS[k]}
            </button>
          );
        })}
      </div>
      {kind && (
        <ReportForm
          key={kind}
          kind={kind}
          stands={stands}
          myStandId={myStandId}
          ownPos={ownPos}
          onCancel={() => setKind(null)}
          onSubmit={(input) => {
            if (preview) {
              setKind(null);
              setDone(`Vorschau: Die Meldung „${REPORT_KINDS[input.kind]}“ würde jetzt an alle Teilnehmer gehen. Es wurde nichts gesendet.`);
              return;
            }
            // Die Meldung geht sofort in die Warteschlange; ohne Netz wird sie später gesendet.
            actions.createReport.mutate(
              { huntId, input },
              { onSuccess: () => setDone((d) => (d ? `Meldung „${REPORT_KINDS[input.kind]}“ gesendet.` : d)) },
            );
            setKind(null);
            setDone(
              onlineManager.isOnline()
                ? `Meldung „${REPORT_KINDS[input.kind]}“ wird gesendet …`
                : `Kein Netz: Meldung „${REPORT_KINDS[input.kind]}“ ist gespeichert und wird gesendet, sobald wieder Netz da ist.`,
            );
          }}
        />
      )}
      {done && <FormSuccess>{done}</FormSuccess>}
      <FormError message={errorText(actions.createReport.error)} />
    </Card>
  );
}

function ReportForm({
  kind,
  stands,
  myStandId,
  ownPos,
  onSubmit,
  onCancel,
}: {
  kind: ReportKind;
  stands: Stand[];
  myStandId: string | null;
  ownPos: OwnPosition | null;
  onSubmit: (input: ReportInput) => void;
  onCancel: () => void;
}) {
  const [species, setSpecies] = useState('');
  const [count, setCount] = useState(1);
  const [standId, setStandId] = useState<string | null>(myStandId);
  const [note, setNote] = useState('');
  const [withPosition, setWithPosition] = useState(ownPos != null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const pos = withPosition && ownPos ? ownPos : null;
    onSubmit(newReport({ kind, species, count, standId, lat: pos?.lat ?? null, lng: pos?.lng ?? null, note }));
  }

  return (
    <form noValidate onSubmit={submit} className="grid gap-3">
      {kind !== 'sonstiges' && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Wildart</legend>
          <div className="flex flex-wrap gap-2">
            {COMMON_SPECIES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={species === s}
                onClick={() => setSpecies(species === s ? '' : s)}
                className={`min-h-10 rounded-xl border px-3 text-sm ${species === s ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface'}`}
              >
                {s}
              </button>
            ))}
          </div>
          <Field label="Wildart (frei)" placeholder="z. B. Überläufer, Schmalreh" value={species} maxLength={60} onChange={(e) => setSpecies(e.target.value)} />
        </fieldset>
      )}
      <div className="flex flex-wrap gap-3">
        <label className="grid gap-1 text-sm font-medium">
          Anzahl
          <input type="number" min={1} max={100} value={count} onChange={(e) => setCount(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} className="min-h-11 w-24 rounded-xl border border-line bg-surface px-3 font-normal" />
        </label>
        <label className="grid flex-1 gap-1 text-sm font-medium">
          Stand
          <select value={standId ?? ''} onChange={(e) => setStandId(e.target.value || null)} className="min-h-11 rounded-xl border border-line bg-surface px-3 font-normal">
            <option value="">Kein Stand</option>
            {stands.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Field label="Notiz (optional)" placeholder={kind === 'angeschossen' ? 'z. B. Schweiß am Anschuss, flüchtig Richtung Bach' : ''} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      {ownPos && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={withPosition} onChange={(e) => setWithPosition(e.target.checked)} className="size-5" />
          Meinen Standort mitsenden
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={kind === 'angeschossen' ? 'danger' : 'primary'}>
          {`${REPORT_KINDS[kind]} melden`}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------ Stände

export function StandsCard({ stands, participants, perms, actions }: { stands: Stand[]; participants: Participant[]; perms: HuntPermissions; actions: HuntActions }) {
  const assignable = participants.filter((p) => !isLeadRole(p.role) || p.standId);
  return (
    <Card>
      <h2 className="mb-3 font-semibold">Stände ({stands.length})</h2>
      {stands.length === 0 ? (
        <p className="text-sm text-muted">{perms.canManage ? 'Setze Stände über „Stand setzen“ auf der Karte.' : 'Noch keine Stände eingetragen.'}</p>
      ) : (
        <ul className="grid gap-2" aria-label="Stände">
          {stands.map((s) => {
            const holder = participants.find((p) => p.standId === s.id) ?? null;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-2 border-b border-line pb-2 last:border-0 last:pb-0">
                <span className="min-w-20 font-medium">{s.label}</span>
                {s.category && <Badge>{CATEGORY_LABEL[s.category]}</Badge>}
                {perms.canManage ? (
                  <select
                    aria-label={`Schütze für ${s.label}`}
                    value={holder?.id ?? ''}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (holder) actions.updateParticipant.mutate({ id: holder.id, standId: null });
                      if (next) actions.updateParticipant.mutate({ id: next, standId: s.id });
                    }}
                    className={`${select} flex-1`}
                  >
                    <option value="">Frei</option>
                    {assignable.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({HUNT_ROLES[p.role]})
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="flex-1 text-sm text-muted">{holder ? holder.name : 'frei'}</span>
                )}
                {perms.canManage && (
                  <Button variant="secondary" aria-label={`${s.label} löschen`} className="text-danger!" onClick={() => actions.removeStand.mutate(s.id)}>
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <FormError message={errorText(actions.updateParticipant.error) ?? errorText(actions.removeStand.error)} />
    </Card>
  );
}

// ------------------------------------------------------------ Zonen

export function ZonesCard({ zones, perms, actions }: { zones: Zone[]; perms: HuntPermissions; actions: HuntActions }) {
  if (zones.length === 0 && !perms.canManage) return null;
  return (
    <Card>
      <h2 className="mb-3 font-semibold">Zonen ({zones.length})</h2>
      {zones.length === 0 ? (
        <p className="text-sm text-muted">Treiben, Sicherheits- und Sperrzonen zeichnest du über „Zone zeichnen“.</p>
      ) : (
        <ul className="grid gap-2" aria-label="Zonen">
          {zones.map((z) => (
            <li key={z.id} className="flex items-center gap-2">
              <span className="size-3 shrink-0 rounded-sm" style={{ background: zoneColor(z) }} />
              <span className="flex-1 font-medium">{z.name}</span>
              <Badge>{ZONE_KINDS[z.kind]}</Badge>
              {perms.canManage && (
                <ConfirmButton label={<Trash2 aria-label={`${z.name} löschen`} className="size-4" />} confirmText={`Zone „${z.name}“ löschen?`} confirmLabel="Ja, löschen" onConfirm={() => actions.removeZone.mutate(z.id)} />
              )}
            </li>
          ))}
        </ul>
      )}
      <FormError message={errorText(actions.removeZone.error)} />
    </Card>
  );
}

// ------------------------------------------------------------ Teilnehmer

export function ParticipantsCard({
  hunt,
  participants,
  stands,
  zones,
  perms,
  actions,
  userId,
}: {
  hunt: Hunt;
  participants: Participant[];
  stands: Stand[];
  zones: Zone[];
  perms: HuntPermissions;
  actions: HuntActions;
  userId: string;
}) {
  const counts = participants.reduce<Partial<Record<HuntRole, number>>>((acc, p) => ({ ...acc, [p.role]: (acc[p.role] ?? 0) + 1 }), {});
  return (
    <Card>
      <h2 className="font-semibold">Teilnehmer ({participants.length})</h2>
      <p className="mb-3 text-sm text-muted">
        {(Object.keys(HUNT_ROLES) as HuntRole[])
          .filter((r) => counts[r])
          .map((r) => `${counts[r]} ${HUNT_ROLES[r]}`)
          .join(' · ')}
      </p>
      <ul className="grid gap-3" aria-label="Teilnehmer">
        {participants.map((p) => {
          const stand = stands.find((s) => s.id === p.standId);
          const canEditRole = perms.canManage && (p.role !== 'jagdleiter' || perms.canAppointLeader);
          return (
            <li key={p.id} className="grid gap-2 border-b border-line pb-3 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {p.name}
                  {p.userId === userId && <span className="text-muted"> (du)</span>}
                </span>
                {!canEditRole && <Badge tone={isLeadRole(p.role) ? 'primary' : 'neutral'}>{HUNT_ROLES[p.role]}</Badge>}
                {stand && <span className="text-sm text-muted">· {stand.label}</span>}
              </div>
              {perms.canManage && (
                <div className="flex flex-wrap items-center gap-2">
                  {canEditRole && (
                    <select aria-label={`Jagdrolle von ${p.name}`} value={p.role} onChange={(e) => actions.updateParticipant.mutate({ id: p.id, role: e.target.value as HuntRole })} className={select}>
                      {perms.assignableRoles.concat(perms.assignableRoles.includes(p.role) ? [] : [p.role]).map((r) => (
                        <option key={r} value={r}>
                          {HUNT_ROLES[r]}
                        </option>
                      ))}
                    </select>
                  )}
                  {zones.length > 0 && p.role !== 'schuetze' && (
                    <select aria-label={`Zone von ${p.name}`} value={p.zoneId ?? ''} onChange={(e) => actions.updateParticipant.mutate({ id: p.id, zoneId: e.target.value || null })} className={select}>
                      <option value="">Keine Zone</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {p.userId !== userId && (
                    <ConfirmButton label="Entfernen" confirmText={`${p.name} aus der Jagd entfernen?`} confirmLabel="Ja, entfernen" onConfirm={() => actions.removeParticipant.mutate(p.id)} />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {perms.canManage && <AddParticipant hunt={hunt} participants={participants} perms={perms} actions={actions} />}
      <FormError message={errorText(actions.updateParticipant.error) ?? errorText(actions.removeParticipant.error)} />
    </Card>
  );
}

function AddParticipant({ hunt, participants, perms, actions }: { hunt: Hunt; participants: Participant[]; perms: HuntPermissions; actions: HuntActions }) {
  const { data: members = [] } = useMembers(hunt.groupId);
  const candidates = members.filter((m) => !participants.some((p) => p.userId === m.userId));
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<HuntRole>('schuetze');
  if (candidates.length === 0) return null;
  return (
    <div className="mt-4 grid gap-2 rounded-xl border border-line p-3">
      <p className="text-sm font-medium">Gruppenmitglied eintragen</p>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Mitglied" value={userId} onChange={(e) => setUserId(e.target.value)} className={`${select} flex-1`}>
          <option value="">Mitglied wählen …</option>
          {candidates.map((m) => (
            <option key={m.userId} value={m.userId}>
              {memberLabel(m)}
            </option>
          ))}
        </select>
        <select aria-label="Jagdrolle" value={role} onChange={(e) => setRole(e.target.value as HuntRole)} className={select}>
          {perms.assignableRoles.map((r) => (
            <option key={r} value={r}>
              {HUNT_ROLES[r]}
            </option>
          ))}
        </select>
        <Button disabled={!userId || actions.addParticipant.isPending} onClick={() => actions.addParticipant.mutate({ userId, role }, { onSuccess: () => setUserId('') })}>
          Eintragen
        </Button>
      </div>
      <FormError message={errorText(actions.addParticipant.error)} />
    </div>
  );
}

// ------------------------------------------------------------ Meldungen

export function ReportsCard({ reports, stands, perms, actions }: { reports: Report[]; stands: Stand[]; perms: HuntPermissions; actions: HuntActions }) {
  return (
    <Card>
      <h2 className="mb-3 font-semibold">Meldungen ({reports.length})</h2>
      {reports.length === 0 ? (
        <p className="text-sm text-muted">Noch keine Meldungen.</p>
      ) : (
        <ul className="grid gap-2" aria-label="Meldungen">
          {reports.map((r) => {
            const stand = stands.find((s) => s.id === r.standId);
            const Icon = REPORT_ICONS[r.kind];
            const open = needsFollowUp(r.kind) && !r.resolvedAt;
            return (
              <li key={r.id} className={`grid gap-1 rounded-xl border p-3 ${r.kind === 'angeschossen' && open ? 'border-danger bg-danger-light/30' : 'border-line'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Icon aria-hidden className={`size-4 ${r.kind === 'angeschossen' ? 'text-danger' : 'text-moss'}`} />
                  <span className="font-medium">
                    {REPORT_KINDS[r.kind]}
                    {r.species && `: ${r.count > 1 ? `${r.count} × ` : ''}${r.species}`}
                  </span>
                  {r.pending && <Badge tone="signal">Wartet auf Netz</Badge>}
                  {needsFollowUp(r.kind) && (
                    <Badge tone={r.resolvedAt ? 'neutral' : 'signal'}>{r.resolvedAt ? (r.kind === 'angeschossen' ? 'Nachsuche erledigt' : 'Geborgen') : r.kind === 'angeschossen' ? 'Nachsuche offen' : 'Bergung offen'}</Badge>
                  )}
                </div>
                <p className="text-sm text-muted">
                  {formatReportTime(r.occurredAt)}
                  {stand ? ` · ${stand.label}` : ''}
                  {r.reporterName ? ` · ${r.reporterName}` : ''}
                  {r.lat != null ? ' · mit Standort' : ''}
                </p>
                {r.note && <p className="text-sm">{r.note}</p>}
                {perms.canEditReport(r) && !r.pending && (
                  <div className="flex flex-wrap gap-2">
                    {r.pending && <Badge tone="signal">Wartet auf Netz</Badge>}
                  {needsFollowUp(r.kind) && (
                      <Button variant="secondary" onClick={() => actions.setReportResolved.mutate({ id: r.id, resolved: !r.resolvedAt })}>
                        {r.resolvedAt ? <RotateCcw aria-hidden className="size-4" /> : <CheckCircle2 aria-hidden className="size-4" />}
                        {r.resolvedAt ? 'Wieder öffnen' : 'Erledigt'}
                      </Button>
                    )}
                    <ConfirmButton label="Löschen" confirmText="Meldung löschen?" confirmLabel="Ja, löschen" onConfirm={() => actions.removeReport.mutate(r.id)} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <FormError message={errorText(actions.setReportResolved.error) ?? errorText(actions.removeReport.error)} />
    </Card>
  );
}
