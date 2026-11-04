import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { Button, Card, Page } from '../../components/ui';
import { Field, FormError, TextArea, Toggle } from '../../components/form';
import { mapError } from '../../lib/errors';
import * as V from '../../lib/validators';
import { useGroupReviere } from '../reviere/useReviere';
import { toLocalInput } from './format';
import type { Hunt, HuntDraft } from './huntModel';
import { useCreateHunt, useHunt, useHuntActions } from './useHunts';

const cancelClass = 'inline-flex min-h-11 items-center px-3 text-sm font-medium text-primary';

/** Nächster Samstag, 8:00 Uhr: der übliche Termin einer Drückjagd. */
function defaultStart(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  d.setHours(8, 0, 0, 0);
  return toLocalInput(d.toISOString());
}

function emptyDraft(): HuntDraft {
  return { title: '', revierId: null, description: '', startsAt: defaultStart(), endsAt: null, meetingPoint: '', gameRelease: '', safetyNotes: '', emergencyInfo: '', selfJoin: true };
}

const fromHunt = (h: Hunt): HuntDraft => ({
  title: h.title,
  revierId: h.revierId,
  description: h.description,
  startsAt: toLocalInput(h.startsAt),
  endsAt: h.endsAt ? toLocalInput(h.endsAt) : null,
  meetingPoint: h.meetingPoint,
  gameRelease: h.gameRelease,
  safetyNotes: h.safetyNotes,
  emergencyInfo: h.emergencyInfo,
  selfJoin: h.selfJoin,
});

export function validateHunt(d: HuntDraft) {
  return {
    title: V.huntTitle(d.title),
    startsAt: d.startsAt && !Number.isNaN(new Date(d.startsAt).getTime()) ? undefined : 'Bitte gib Datum und Uhrzeit des Beginns an.',
    endsAt: d.endsAt && new Date(d.endsAt) <= new Date(d.startsAt) ? 'Das Ende muss nach dem Beginn liegen.' : undefined,
    description: V.maxLength(4000)(d.description),
    meetingPoint: V.maxLength(500)(d.meetingPoint),
    gameRelease: V.maxLength(2000)(d.gameRelease),
    safetyNotes: V.maxLength(4000)(d.safetyNotes),
    emergencyInfo: V.maxLength(2000)(d.emergencyInfo),
  };
}

function HuntForm({
  title,
  groupId,
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  cancel,
}: {
  title: string;
  groupId: string;
  initial: HuntDraft;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (d: HuntDraft) => void;
  cancel: React.ReactNode;
}) {
  const { data: reviere = [] } = useGroupReviere(groupId);
  const [d, setD] = useState(initial);
  const [touched, setTouched] = useState(false);
  const errors = validateHunt(d);
  const show = (k: keyof typeof errors) => (touched ? errors[k] : undefined);
  const set = <K extends keyof HuntDraft>(k: K) => (v: HuntDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (Object.values(errors).some(Boolean)) return;
    onSubmit(d);
  }

  return (
    <Page title={title}>
      <Card>
        <form noValidate onSubmit={submit} className="grid gap-4">
          <Field label="Titel" placeholder="z. B. Drückjagd Fünfzehnhöfe" value={d.title} onChange={(e) => set('title')(e.target.value)} error={show('title')} />
          <label className="grid gap-1 text-sm font-medium">
            Revier
            <select value={d.revierId ?? ''} onChange={(e) => set('revierId')(e.target.value || null)} className="min-h-11 rounded-xl border border-line bg-surface px-3 font-normal">
              <option value="">Kein Revier</option>
              {reviere.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Beginn" type="datetime-local" value={d.startsAt} onChange={(e) => set('startsAt')(e.target.value)} error={show('startsAt')} />
            <Field label="Ende (optional)" type="datetime-local" value={d.endsAt ?? ''} onChange={(e) => set('endsAt')(e.target.value || null)} error={show('endsAt')} />
          </div>
          <Field label="Treffpunkt" placeholder="z. B. Parkplatz am Hof, 7:30 Uhr" value={d.meetingPoint} onChange={(e) => set('meetingPoint')(e.target.value)} error={show('meetingPoint')} />
          <TextArea label="Freigabe" placeholder="z. B. Schwarzwild ohne Leitbachen, Rehwild weiblich und Kitze, Fuchs" rows={2} value={d.gameRelease} onChange={(e) => set('gameRelease')(e.target.value)} error={show('gameRelease')} />
          <TextArea label="Sicherheitshinweise" placeholder="z. B. Kugelfang beachten, kein Schuss ins Treiben, Signalfarbe Pflicht" value={d.safetyNotes} onChange={(e) => set('safetyNotes')(e.target.value)} error={show('safetyNotes')} />
          <TextArea label="Notfall" placeholder="z. B. Rettungspunkt, nächstes Krankenhaus, Telefon der Jagdleitung" rows={2} value={d.emergencyInfo} onChange={(e) => set('emergencyInfo')(e.target.value)} error={show('emergencyInfo')} />
          <TextArea label="Beschreibung (optional)" value={d.description} onChange={(e) => set('description')(e.target.value)} error={show('description')} />
          <Toggle label="Selbst eintragen erlaubt" description="Gruppenmitglieder können sich als Schütze, Treiber, Hundeführer oder Bergung eintragen." checked={d.selfJoin} onChange={set('selfJoin')} />
          <FormError message={error ? mapError(error).message : null} />
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? 'Speichern …' : submitLabel}
            </Button>
            {cancel}
          </div>
        </form>
      </Card>
    </Page>
  );
}

export function CreateHuntPage() {
  const { groupId } = useParams({ from: '/shell/gruppe/$groupId/jagd-neu' });
  const create = useCreateHunt(groupId);
  const navigate = useNavigate();
  return (
    <HuntForm
      title="Jagd planen"
      groupId={groupId}
      initial={emptyDraft()}
      submitLabel="Jagd anlegen"
      pending={create.isPending}
      error={create.error}
      onSubmit={(d) => create.mutate(d, { onSuccess: (h) => navigate({ to: '/jagd/$huntId', params: { huntId: h.id } }) })}
      cancel={
        <Link to="/gruppe/$groupId" params={{ groupId }} className={cancelClass}>
          Abbrechen
        </Link>
      }
    />
  );
}

export function EditHuntPage() {
  const { huntId } = useParams({ from: '/shell/jagd/$huntId/bearbeiten' });
  const { data: hunt, error } = useHunt(huntId);
  const { update } = useHuntActions(huntId);
  const navigate = useNavigate();
  if (!hunt) {
    return <Page title="Jagd bearbeiten">{error ? <FormError message={mapError(error).message} /> : <p className="text-sm text-muted">Jagd wird geladen …</p>}</Page>;
  }
  return (
    <HuntForm
      title="Jagd bearbeiten"
      groupId={hunt.groupId}
      initial={fromHunt(hunt)}
      submitLabel="Speichern"
      pending={update.isPending}
      error={update.error}
      onSubmit={(d) => update.mutate(d, { onSuccess: () => navigate({ to: '/jagd/$huntId', params: { huntId } }) })}
      cancel={
        <Link to="/jagd/$huntId" params={{ huntId }} className={cancelClass}>
          Abbrechen
        </Link>
      }
    />
  );
}
