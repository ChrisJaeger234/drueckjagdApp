import { Link, useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui';
import { Field, FormError } from '../../components/form';
import * as V from '../../lib/validators';
import { useAuth } from './AuthContext';
import { AuthLayout } from './AuthLayout';
import { useSubmit } from './useSubmit';

/** Ziel des Links aus der Passwort-Mail; Supabase meldet dabei eine Sitzung im Wiederherstellungsmodus. */
export function NewPasswordPage() {
  const { service, user, status } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const { busy, error, run } = useSubmit();
  const errors = { password: V.password(password), confirm: V.passwordConfirmation(confirm, password) };

  if (status === 'signedOut' || (status === 'signedIn' && !user)) {
    return (
      <AuthLayout title="Link abgelaufen">
        <p className="mb-4 text-sm">Dieser Link ist ungültig oder abgelaufen. Fordere bitte einen neuen an.</p>
        <Link to="/passwort-vergessen" className="text-sm font-medium text-primary underline">
          Neuen Link anfordern
        </Link>
      </AuthLayout>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (errors.password || errors.confirm) return;
    const ok = await run(async () => {
      await service.updatePassword(password);
      return true;
    });
    if (ok) await navigate({ to: '/' });
  }

  return (
    <AuthLayout title="Neues Passwort" subtitle={user?.email ? `Für ${user.email}` : undefined}>
      <form noValidate onSubmit={submit} className="grid gap-4">
        <Field
          label="Neues Passwort"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={touched ? errors.password : undefined}
          hint="Mindestens 8 Zeichen mit Buchstaben und Ziffern."
        />
        <Field label="Passwort bestätigen" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={touched ? errors.confirm : undefined} />
        <FormError message={error?.message} />
        <Button type="submit" disabled={busy || status === 'initializing'}>
          {busy ? 'Speichern …' : 'Passwort speichern'}
        </Button>
      </form>
    </AuthLayout>
  );
}
