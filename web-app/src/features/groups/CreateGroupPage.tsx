import { Link, useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { Button, Card, Page } from '../../components/ui';
import { Field, FormError, TextArea } from '../../components/form';
import { mapError } from '../../lib/errors';
import * as V from '../../lib/validators';
import { useCreateGroup } from './useGroups';

export function CreateGroupPage() {
  const create = useCreateGroup();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [touched, setTouched] = useState(false);
  const errors = { name: V.groupName(name), description: V.maxLength(500)(description) };

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (errors.name || errors.description) return;
    create.mutate({ name, description }, { onSuccess: (g) => navigate({ to: '/gruppe/$groupId', params: { groupId: g.id } }) });
  }

  return (
    <Page title="Gruppe erstellen">
      <Card>
        <form noValidate onSubmit={submit} className="grid gap-4">
          <Field label="Name der Gruppe" value={name} onChange={(e) => setName(e.target.value)} error={touched ? errors.name : undefined} hint="Zum Beispiel „Hegering Nord“." />
          <TextArea label="Beschreibung (optional)" value={description} onChange={(e) => setDescription(e.target.value)} error={touched ? errors.description : undefined} />
          <p className="text-sm text-muted">Du wirst Owner der Gruppe und kannst danach Mitglieder per Einladungscode aufnehmen.</p>
          <FormError message={create.error ? mapError(create.error).message : null} />
          <div className="flex gap-2">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Erstellen …' : 'Gruppe erstellen'}
            </Button>
            <Link to="/gruppe" className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-primary">
              Abbrechen
            </Link>
          </div>
        </form>
      </Card>
    </Page>
  );
}
