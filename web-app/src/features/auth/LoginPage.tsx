import { Link, useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui';
import { Field, FormError, FormSuccess } from '../../components/form';
import * as V from '../../lib/validators';
import { useAuth } from './AuthContext';
import { AuthLayout } from './AuthLayout';
import { useSubmit } from './useSubmit';

export function LoginPage() {
  const { service } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const [resent, setResent] = useState(false);
  const { busy, error, run } = useSubmit();

  const errors = { email: V.email(email), password: V.loginPassword(password) };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setResent(false);
    if (errors.email || errors.password) return;
    const ok = await run(async () => {
      await service.signIn({ email, password });
      return true;
    });
    if (ok) await navigate({ to: '/' });
  }

  return (
    <AuthLayout title="Anmelden" subtitle="Mit deinem bestehenden Konto aus der Drückjagd-App.">
      <form noValidate onSubmit={submit} className="grid gap-4">
        <Field label="E-Mail" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={touched ? errors.email : undefined} />
        <Field label="Passwort" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={touched ? errors.password : undefined} />
        <FormError message={error?.message} />
        {error?.kind === 'emailNotConfirmed' && !resent && (
          <Button variant="secondary" disabled={busy} onClick={() => run(() => service.resendConfirmation(email)).then(() => setResent(true))}>
            Bestätigungs-Mail erneut senden
          </Button>
        )}
        {resent && <FormSuccess>Wir haben dir die Bestätigungs-Mail erneut geschickt.</FormSuccess>}
        <Button type="submit" disabled={busy}>
          {busy ? 'Anmelden …' : 'Anmelden'}
        </Button>
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <Link to="/passwort-vergessen" className="font-medium text-primary underline-offset-2 hover:underline">
            Passwort vergessen?
          </Link>
          <Link to="/registrieren" className="font-medium text-primary underline-offset-2 hover:underline">
            Neues Konto erstellen
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
