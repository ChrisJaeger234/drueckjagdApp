import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { Button, Card, Page } from '../../components/ui';
import { Field, FormError, TextArea } from '../../components/form';
import { mapError } from '../../lib/errors';
import * as V from '../../lib/validators';
import { useRevier, useRevierActions } from './useReviere';

function RevierForm({
  title,
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  cancel,
}: {
  title: string;
  initial: { name: string; description: string };
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (v: { name: string; description: string }) => void;
  cancel: React.ReactNode;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [touched, setTouched] = useState(false);
  const errors = { name: V.revierName(name), description: V.maxLength(2000)(description) };

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (errors.name || errors.description) return;
    onSubmit({ name, description });
  }

  return (
    <Page title={title}>
      <Card>
        <form noValidate onSubmit={submit} className="grid gap-4">
          <Field label="Name des Reviers" value={name} onChange={(e) => setName(e.target.value)} error={touched ? errors.name : undefined} />
          <TextArea label="Beschreibung (optional)" value={description} onChange={(e) => setDescription(e.target.value)} error={touched ? errors.description : undefined} />
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

const cancelClass = 'inline-flex min-h-11 items-center px-3 text-sm font-medium text-primary';

export function CreateRevierPage() {
  const { groupId } = useParams({ from: '/shell/gruppe/$groupId/revier-neu' });
  const { create } = useRevierActions();
  const navigate = useNavigate();
  return (
    <RevierForm
      title="Revier anlegen"
      initial={{ name: '', description: '' }}
      submitLabel="Revier anlegen"
      pending={create.isPending}
      error={create.error}
      onSubmit={(v) => create.mutate({ groupId, ...v }, { onSuccess: (r) => navigate({ to: '/revier/$revierId', params: { revierId: r.id } }) })}
      cancel={
        <Link to="/gruppe/$groupId" params={{ groupId }} className={cancelClass}>
          Abbrechen
        </Link>
      }
    />
  );
}

export function EditRevierPage() {
  const { revierId } = useParams({ from: '/shell/revier/$revierId/bearbeiten' });
  const { data: revier, error } = useRevier(revierId);
  const { update } = useRevierActions();
  const navigate = useNavigate();
  const back = (
    <Link to="/revier/$revierId" params={{ revierId }} className={cancelClass}>
      Abbrechen
    </Link>
  );
  if (!revier) {
    return (
      <Page title="Revier bearbeiten">
        {error ? <FormError message={mapError(error).message} /> : <p className="text-sm text-muted">Revier wird geladen …</p>}
      </Page>
    );
  }
  return (
    <RevierForm
      title="Revier bearbeiten"
      initial={revier}
      submitLabel="Speichern"
      pending={update.isPending}
      error={update.error}
      onSubmit={(v) => update.mutate({ revierId, ...v }, { onSuccess: () => navigate({ to: '/revier/$revierId', params: { revierId } }) })}
      cancel={back}
    />
  );
}
