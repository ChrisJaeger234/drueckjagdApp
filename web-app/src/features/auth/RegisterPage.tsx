import { Link, useNavigate } from '@tanstack/react-router';
import { MailCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui';
import { Field, FormError, FormSuccess } from '../../components/form';
import * as V from '../../lib/validators';
import { useAuth } from './AuthContext';
import { AuthLayout } from './AuthLayout';
import { useSubmit } from './useSubmit';

export function RegisterPage() {
  const { service } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const { busy, error, run } = useSubmit();

  const errors = {
    email: V.email(email),
    password: V.password(password),
    confirm: V.passwordConfirmation(confirm, password),
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (errors.email || errors.password || errors.confirm) return;
    const result = await run(() => service.signUp({ email, password }));
    if (result === 'signedIn') await navigate({ to: '/profil' });
    if (result === 'confirmationRequired') setSentTo(email.trim());
  }

  if (sentTo) {
    return (
      <AuthLayout title="Fast geschafft">
        <div className="grid gap-4">
          <MailCheck aria-hidden className="size-10 text-moss" />
          <p className="text-sm">
            Wir haben eine Bestätigungs-Mail an <strong>{sentTo}</strong> geschickt. Öffne den Link darin und melde dich danach hier an.
          </p>
          <p className="text-sm text-muted">
            Auf dem iPhone öffnet sich der Link in Safari. Danach kannst du dich in der App vom Home-Bildschirm ganz normal anmelden.
          </p>
          <FormError message={error?.message} />
          {resent && <FormSuccess>Die Bestätigungs-Mail wurde erneut verschickt.</FormSuccess>}
          <Button onClick={() => navigate({ to: '/anmelden' })}>Zur Anmeldung</Button>
          <Button variant="secondary" disabled={busy} onClick={() => run(() => service.resendConfirmation(sentTo)).then(() => setResent(true))}>
            E-Mail erneut senden
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Registrieren" subtitle="Lege ein Konto an. Danach trittst du mit einem Einladungscode deiner Gruppe bei.">
      <form noValidate onSubmit={submit} className="grid gap-4">
        <Field label="E-Mail" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={touched ? errors.email : undefined} />
        <Field
          label="Passwort"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={touched ? errors.password : undefined}
          hint="Mindestens 8 Zeichen mit Buchstaben und Ziffern."
        />
        <Field label="Passwort bestätigen" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={touched ? errors.confirm : undefined} />
        <FormError message={error?.message} />
        <Button type="submit" disabled={busy}>
          {busy ? 'Registrieren …' : 'Registrieren'}
        </Button>
        <Link to="/anmelden" className="text-center text-sm font-medium text-primary underline-offset-2 hover:underline">
          Bereits registriert? Anmelden
        </Link>
      </form>
    </AuthLayout>
  );
}
