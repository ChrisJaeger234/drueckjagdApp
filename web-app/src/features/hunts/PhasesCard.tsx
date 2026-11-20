// Phasen einer Jagd (Migration 0016): Abschnitte mit eigener Zuteilung von Ständen und Zonen.
import { ArrowDown, ArrowUp, ChevronRight, Layers, PencilLine, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, CollapsibleCard, ConfirmButton } from '../../components/ui';
import { FormError } from '../../components/form';
import { mapError } from '../../lib/errors';
import { HUNT_ROLES, nextPhase, sortPhases, zoneIdsOf, type ExtraZone, type Hunt, type HuntPermissions, type Participant, type Phase, type PhaseAssignment, type Stand, type Zone } from './huntModel';
import type { HuntActions } from './useHunts';
import { ZonePicker } from './ZonePicker';

const errorText = (e: unknown) => (e ? mapError(e).message : null);
const select = 'min-h-10 rounded-xl border border-line bg-surface px-2 text-sm';

export function PhasesCard({
  hunt,
  phases,
  assignments,
  participants,
  stands,
  zones,
  extras = null,
  perms,
  actions,
}: {
  hunt: Hunt;
  phases: Phase[];
  assignments: PhaseAssignment[];
  participants: Participant[];
  stands: Stand[];
  zones: Zone[];
  /** Weitere Zonen (Migration 0018); null = nur eine Zone je Teilnehmer. */
  extras?: ExtraZone[] | null;
  perms: HuntPermissions;
  actions: HuntActions;
}) {
  const [planning, setPlanning] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const sorted = sortPhases(phases);
  const current = sorted.find((p) => p.id === hunt.currentPhaseId) ?? null;
  const next = nextPhase(sorted, hunt.currentPhaseId);
  const position = current ? sorted.indexOf(current) + 1 : 0;
  const planned = sorted.find((p) => p.id === planning) ?? null;

  if (sorted.length === 0 && !perms.canManage) return null;

  const add = () =>
    actions.addPhase.mutate({ phases: sorted, currentPhaseId: hunt.currentPhaseId, participants, assignments, extras }, { onSuccess: (p) => sorted.length > 0 && setPlanning((p as Phase).id) });
  const error = errorText(actions.addPhase.error) ?? errorText(actions.activatePhase.error) ?? errorText(actions.removePhase.error) ?? errorText(actions.setAssignment.error) ?? errorText(actions.setZones.error) ?? errorText(actions.renamePhase.error) ?? errorText(actions.movePhase.error);
  const saveName = () => {
    if (!renaming) return;
    const name = renaming.name.trim();
    if (name.length === 0 || name.length > 60) return;
    actions.renamePhase.mutate({ id: renaming.id, name }, { onSuccess: () => setRenaming(null) });
  };

  return (
    <>
      <CollapsibleCard
        label="Phasen"
        storageKey="jagd-phasen"
        title={
          <>
            <Layers aria-hidden className="size-5 text-primary" />
            Phasen
            {current && (
              <Badge tone="primary">
                Aktiv: {current.name} ({position} von {sorted.length})
              </Badge>
            )}
          </>
        }
      >

        {sorted.length === 0 && (
          <>
            <p className="text-sm text-muted">
              Teile die Jagd in Abschnitte (Phase 1, Phase 2, …). Jede Phase hat ihre eigene Zuteilung von Ständen und Zonen; beim Umschalten sehen alle ihren neuen Stand.
            </p>
            <Button variant="secondary" disabled={actions.addPhase.isPending} onClick={add}>
              <Layers aria-hidden className="size-4" /> Phasen nutzen
            </Button>
            <p className="text-xs text-muted">Phase 1 übernimmt die jetzige Zuteilung.</p>
          </>
        )}

        {sorted.length > 0 && (
          <ul className="grid gap-2" aria-label="Phasen">
            {sorted.map((p, i) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 border-b border-line pb-2 last:border-0 last:pb-0">
                {renaming?.id === p.id ? (
                  <form
                    className="flex w-full flex-wrap items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveName();
                    }}
                  >
                    <input
                      aria-label={`Neuer Name für ${p.name}`}
                      value={renaming.name}
                      maxLength={60}
                      autoFocus
                      onChange={(e) => setRenaming({ id: p.id, name: e.target.value })}
                      className="min-h-10 flex-1 rounded-xl border border-line bg-surface px-3 text-sm"
                    />
                    <Button type="submit" disabled={actions.renamePhase.isPending || renaming.name.trim().length === 0}>
                      Speichern
                    </Button>
                    <Button variant="secondary" onClick={() => setRenaming(null)}>
                      Abbrechen
                    </Button>
                  </form>
                ) : (
                  <span className="flex-1 font-medium">{p.name}</span>
                )}
                {p.id === hunt.currentPhaseId && <Badge tone="primary">aktiv</Badge>}
                {perms.canManage && renaming?.id !== p.id && (
                  <>
                    <Button variant="secondary" aria-label={`${p.name} umbenennen`} onClick={() => setRenaming({ id: p.id, name: p.name })}>
                      <PencilLine aria-hidden className="size-4" />
                    </Button>
                    {sorted.length > 1 && (
                      <>
                        <Button variant="secondary" aria-label={`${p.name} nach oben`} disabled={i === 0 || actions.movePhase.isPending} onClick={() => actions.movePhase.mutate({ phases: sorted, id: p.id, by: -1 })}>
                          <ArrowUp aria-hidden className="size-4" />
                        </Button>
                        <Button
                          variant="secondary"
                          aria-label={`${p.name} nach unten`}
                          disabled={i === sorted.length - 1 || actions.movePhase.isPending}
                          onClick={() => actions.movePhase.mutate({ phases: sorted, id: p.id, by: 1 })}
                        >
                          <ArrowDown aria-hidden className="size-4" />
                        </Button>
                      </>
                    )}
                  </>
                )}
                {perms.canManage && p.id !== hunt.currentPhaseId && (
                  <>
                    <Button variant="secondary" onClick={() => setPlanning(planning === p.id ? null : p.id)} aria-pressed={planning === p.id}>
                      Planen
                    </Button>
                    <Button variant="secondary" disabled={actions.activatePhase.isPending} onClick={() => actions.activatePhase.mutate(p.id, { onSuccess: () => setPlanning(null) })}>
                      Aktivieren
                    </Button>
                    <ConfirmButton
                      label={<Trash2 aria-label={`${p.name} löschen`} className="size-4" />}
                      confirmText={`„${p.name}“ mit ihrer Zuteilung löschen?`}
                      confirmLabel="Ja, löschen"
                      onConfirm={() => actions.removePhase.mutate(p.id, { onSuccess: () => planning === p.id && setPlanning(null) })}
                    />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {perms.canManage && sorted.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {next && (
              <Button disabled={actions.activatePhase.isPending} onClick={() => actions.activatePhase.mutate(next.id, { onSuccess: () => setPlanning(null) })}>
                <ChevronRight aria-hidden className="size-4" /> Weiter zu {next.name}
              </Button>
            )}
            <Button variant="secondary" disabled={actions.addPhase.isPending} onClick={add}>
              <Plus aria-hidden className="size-4" /> Phase hinzufügen
            </Button>
          </div>
        )}
        {perms.canManage && current && (
          <p className="text-xs text-muted">
            Änderungen an Ständen und Zonen weiter unten gelten sofort für die aktive Phase, auch während der Jagd. Andere Phasen planst du über „Planen“. Eine neue Phase übernimmt die Zuteilung der aktiven Phase; für eine Zwischenphase (z. B. „Phase 1,5“) neue Phase hinzufügen, umbenennen, mit den Pfeilen an die richtige Stelle schieben und nur die Personen ändern, die versetzt werden.
          </p>
        )}
        <FormError message={error} />
      </CollapsibleCard>

      {perms.canManage && planned && (
        <PhasePlanCard key={planned.id} phase={planned} assignments={assignments} participants={participants} stands={stands} zones={zones} extras={extras} actions={actions} onClose={() => setPlanning(null)} />
      )}
    </>
  );
}

/** Zuteilung einer (nicht aktiven) Phase im Voraus planen. */
function PhasePlanCard({
  phase,
  assignments,
  participants,
  stands,
  zones,
  extras,
  actions,
  onClose,
}: {
  phase: Phase;
  assignments: PhaseAssignment[];
  participants: Participant[];
  stands: Stand[];
  zones: Zone[];
  extras: ExtraZone[] | null;
  actions: HuntActions;
  onClose: () => void;
}) {
  const of = (participantId: string) => assignments.find((a) => a.phaseId === phase.id && a.participantId === participantId);
  const set = (participantId: string, patch: { standId?: string | null; zoneId?: string | null }) => {
    const a = of(participantId);
    actions.setAssignment.mutate({ phaseId: phase.id, participantId, standId: a?.standId ?? null, zoneId: a?.zoneId ?? null, ...patch });
  };
  return (
    <Card className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Zuteilung {phase.name} planen</h2>
        <Button variant="secondary" onClick={onClose}>
          Fertig
        </Button>
      </div>
      <p className="text-sm text-muted">Gilt, sobald du „{phase.name}“ aktivierst.</p>
      <ul className="grid gap-3" aria-label={`Zuteilung ${phase.name}`}>
        {participants.map((p) => {
          const a = of(p.id);
          return (
            <li key={p.id} className="grid gap-1">
              <span className="text-sm font-medium">
                {p.name} <span className="font-normal text-muted">({HUNT_ROLES[p.role]})</span>
              </span>
              <div className="flex flex-wrap gap-2">
                <select aria-label={`Stand von ${p.name} in ${phase.name}`} value={a?.standId ?? ''} onChange={(e) => set(p.id, { standId: e.target.value || null })} className={select}>
                  <option value="">Kein Stand</option>
                  {stands.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                {zones.length > 0 && (
                  <ZonePicker
                    label={`Zone von ${p.name} in ${phase.name}`}
                    zones={zones}
                    multi={extras !== null}
                    disabled={actions.setZones.isPending}
                    value={zoneIdsOf(a?.zoneId ?? null, extras ?? [], p.id, phase.id, zones)}
                    onChange={(zoneIds) =>
                      actions.setZones.mutate({ participantId: p.id, phaseId: phase.id, zoneIds, currentMain: a?.zoneId ?? null, extras: extras ?? [], plan: { standId: a?.standId ?? null } })
                    }
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
