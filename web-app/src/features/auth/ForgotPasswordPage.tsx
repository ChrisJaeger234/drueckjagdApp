import { Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui';
import { Field, FormError, FormSuccess } from '../../components/form';
import * as V from '../../lib/validators';
import { useAuth } from './AuthContext';
import { AuthLayout } from './AuthLayout';
import { useSubmit } from './useSubmit';

export function ForgotPasswordPage() {
  const { service } = useAuth();
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useSubmit();
  const emailError = V.email(email);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (emailError) return;
    const ok = await run(async () => {
      await service.requestPasswordReset(email);
      return true;
    });
    if (ok) setSent(true);
  }

  return (
    <AuthLayout title="Passwort vergessen" subtitle="Wir schicken dir einen Link, mit dem du ein neues Passwort festlegst.">
      <form noValidate onSubmit={submit} className="grid gap-4">
        <Field label="E-Mail" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={touched ? emailError : undefined} />
        <FormError message={error?.message} />
        {sent && <FormSuccess>Falls ein Konto zu dieser Adresse existiert, ist die E-Mail unterwegs. Bitte schau auch im Spam-Ordner nach.</FormSuccess>}
        <Button type="submit" disabled={busy}>
          {busy ? 'Senden …' : 'Link senden'}
        </Button>
        <Link to="/anmelden" className="text-center text-sm font-medium text-primary underline-offset-2 hover:underline">
          Zurück zur Anmeldung
        </Link>
      </form>
    </AuthLayout>
  );
}
