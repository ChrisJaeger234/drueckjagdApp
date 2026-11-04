import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { Button, Card, Page } from '../../components/ui';
import { Field, FormError } from '../../components/form';
import { mapError } from '../../lib/errors';
import * as V from '../../lib/validators';
import { formatInviteCode } from './groupModel';
import { useRedeemInvite } from './useGroups';

export function JoinGroupPage() {
  // Einladungslinks enthalten den Code: …/gruppe/beitreten?code=ABCD-EFGH-JKMN
  const search = useSearch({ strict: false }) as { code?: string };
  const redeem = useRedeemInvite();
  const navigate = useNavigate();
  const [code, setCode] = useState(search.code ? formatInviteCode(V.normalizeInviteCode(search.code)) : '');
  const [touched, setTouched] = useState(false);
  const codeError = V.inviteCode(code);

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (codeError) return;
    redeem.mutate(formatInviteCode(V.normalizeInviteCode(code)), {
      onSuccess: (groupId) => navigate({ to: '/gruppe/$groupId', params: { groupId } }),
    });
  }

  return (
    <Page title="Gruppe beitreten">
      <Card>
        <form noValidate onSubmit={submit} className="grid gap-4">
          <Field
            label="Einladungscode"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="ABCD-EFGH-JKMN"
            value={code}
            onChange={(e) => setCode(formatInviteCode(V.normalizeInviteCode(e.target.value).slice(0, 12)))}
            error={touched ? codeError : undefined}
            hint="Den Code bekommst du von der Jagdleitung oder einem Admin der Gruppe."
          />
          <FormError message={redeem.error ? mapError(redeem.error).message : null} />
          <div className="flex gap-2">
            <Button type="submit" disabled={redeem.isPending}>
              {redeem.isPending ? 'Beitreten …' : 'Beitreten'}
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
