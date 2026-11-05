// Phasen einer Jagd (Migration 0016): Abschnitte mit eigener Zuteilung von Ständen und Zonen.
import { ChevronRight, Layers, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, ConfirmButton } from '../../components/ui';
import { FormError } from '../../components/form';
import { mapError } from '../../lib/errors';
import { HUNT_ROLES, nextPhase, sortPhases, type Hunt, type HuntPermissions, type Participant, type Phase, type PhaseAssignment, type Stand, type Zone } from './huntModel';
import type { HuntActions } from './useHunts';

const errorText = (e: unknown) => (e ? mapError(e).message : null);
const select = 'min-h-10 rounded-xl border border-line bg-surface px-2 text-sm';

export function PhasesCard({
  hunt,
  phases,
  assignments,
  participants,
  stands,
  zones,
  perms,
  actions,
}: {
  hunt: Hunt;
  phases: Phase[];
  assignments: PhaseAssignment[];
  participants: Participant[];
  stands: Stand[];
  zones: Zone[];
  perms: HuntPermissions;
  actions: HuntActions;
}) {
  const [planning, setPlanning] = useState<string | null>(null);
  const sorted = sortPhases(phases);
  const current = sorted.find((p) => p.id === hunt.currentPhaseId) ?? null;
  const next = nextPhase(sorted, hunt.currentPhaseId);
  const position = current ? sorted.indexOf(current) + 1 : 0;
  const planned = sorted.find((p) => p.id === planning) ?? null;

  if (sorted.length === 0 && !perms.canManage) return null;

  const add = () =>
    actions.addPhase.mutate({ phases: sorted, currentPhaseId: hunt.currentPhaseId, participants, assignments }, { onSuccess: (p) => sorted.length > 0 && setPlanning((p as Phase).id) });
  const error = errorText(actions.addPhase.error) ?? errorText(actions.activatePhase.error) ?? errorText(actions.removePhase.error) ?? errorText(actions.setAssignment.error);

  return (
    <>
      <Card className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Layers aria-hidden className="size-5 text-primary" />
          <h2 className="font-semibold">Phasen</h2>
          {current && (
            <Badge tone="primary">
              Aktiv: {current.name} ({position} von {sorted.length})
            </Badge>
          )}
        </div>

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
            {sorted.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 border-b border-line pb-2 last:border-0 last:pb-0">
                <span className="flex-1 font-medium">{p.name}</span>
                {p.id === hunt.currentPhaseId && <Badge tone="primary">aktiv</Badge>}
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
          <p className="text-xs text-muted">Änderungen an Ständen und Zonen weiter unten gelten für die aktive Phase. Andere Phasen planst du über „Planen“.</p>
        )}
        <FormError message={error} />
      </Card>

      {perms.canManage && planned && (
        <PhasePlanCard key={planned.id} phase={planned} assignments={assignments} participants={participants} stands={stands} zones={zones} actions={actions} onClose={() => setPlanning(null)} />
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
  actions,
  onClose,
}: {
  phase: Phase;
  assignments: PhaseAssignment[];
  participants: Participant[];
  stands: Stand[];
  zones: Zone[];
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
                <select aria-label={`Zone von ${p.name} in ${phase.name}`} value={a?.zoneId ?? ''} onChange={(e) => set(p.id, { zoneId: e.target.value || null })} className={select}>
                  <option value="">Keine Zone</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
