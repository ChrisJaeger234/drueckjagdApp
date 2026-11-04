import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FakeAuth } from '../../test/fakes';
import { renderApp, signedIn } from '../../test/renderApp';

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

describe('Anmeldung', () => {
  it('schickt Abgemeldete von geschützten Seiten zur Anmeldung', async () => {
    renderApp('/profil');
    expect(await heading('Anmelden')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Hauptnavigation' })).not.toBeInTheDocument();
  });

  it('prüft die Eingaben, bevor etwas gesendet wird', async () => {
    const { auth } = renderApp('/anmelden');
    await userEvent.click(await screen.findByRole('button', { name: 'Anmelden' }));
    expect(screen.getByText('Bitte gib deine E-Mail-Adresse ein.')).toBeInTheDocument();
    expect(screen.getByText('Bitte gib dein Passwort ein.')).toBeInTheDocument();
    expect(auth.calls).toEqual([]);
  });

  it('meldet falsche Zugangsdaten verständlich', async () => {
    const auth = new FakeAuth();
    auth.passwords.set('max@revier.de', 'waidmann1');
    renderApp('/anmelden', { auth });
    await userEvent.type(await screen.findByLabelText('E-Mail'), 'max@revier.de');
    await userEvent.type(screen.getByLabelText('Passwort'), 'falsch123');
    await userEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('E-Mail-Adresse oder Passwort ist falsch.');
  });

  it('meldet an und zeigt die Übersicht mit Navigation', async () => {
    const auth = new FakeAuth();
    auth.passwords.set('max@revier.de', 'waidmann1');
    renderApp('/anmelden', { auth });
    await userEvent.type(await screen.findByLabelText('E-Mail'), 'max@revier.de');
    await userEvent.type(screen.getByLabelText('Passwort'), 'waidmann1');
    await userEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(await heading('Übersicht')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Hauptnavigation' })).toBeInTheDocument();
  });

  it('bietet bei unbestätigter E-Mail das erneute Senden an', async () => {
    const auth = new FakeAuth();
    auth.passwords.set('neu@revier.de', 'waidmann1');
    auth.unconfirmed.add('neu@revier.de');
    renderApp('/anmelden', { auth });
    await userEvent.type(await screen.findByLabelText('E-Mail'), 'neu@revier.de');
    await userEvent.type(screen.getByLabelText('Passwort'), 'waidmann1');
    await userEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Bestätigungs-Mail erneut senden' }));
    expect(await screen.findByText('Wir haben dir die Bestätigungs-Mail erneut geschickt.')).toBeInTheDocument();
    expect(auth.calls).toContain('resend:neu@revier.de');
  });

  it('leitet Angemeldete von der Anmeldeseite zur Übersicht', async () => {
    renderApp('/anmelden', { auth: signedIn() });
    expect(await heading('Übersicht')).toBeInTheDocument();
  });
});

describe('Registrierung', () => {
  async function fillRegister(email: string, pw: string, confirm = pw) {
    await userEvent.type(await screen.findByLabelText('E-Mail'), email);
    await userEvent.type(screen.getByLabelText('Passwort'), pw);
    await userEvent.type(screen.getByLabelText('Passwort bestätigen'), confirm);
    await userEvent.click(screen.getByRole('button', { name: 'Registrieren' }));
  }

  it('prüft Passwortregeln und Bestätigung', async () => {
    const { auth } = renderApp('/registrieren');
    await fillRegister('max@revier.de', 'kurz1', 'anders');
    expect(screen.getByText('Das Passwort muss mindestens 8 Zeichen lang sein.')).toBeInTheDocument();
    expect(screen.getByText('Die Passwörter stimmen nicht überein.')).toBeInTheDocument();
    expect(auth.calls).toEqual([]);
  });

  it('zeigt nach der Registrierung den Hinweis auf die Bestätigungs-Mail', async () => {
    const auth = new FakeAuth();
    auth.confirmationRequired = true;
    renderApp('/registrieren', { auth });
    await fillRegister('neu@revier.de', 'waidmann1');
    expect(await heading('Fast geschafft')).toBeInTheDocument();
    expect(screen.getByText('neu@revier.de')).toBeInTheDocument();
  });

  it('führt ohne Bestätigungspflicht direkt zum Profil', async () => {
    renderApp('/registrieren');
    await fillRegister('neu@revier.de', 'waidmann1');
    expect(await heading('Profil')).toBeInTheDocument();
  });
});

describe('Passwort', () => {
  it('fordert den Link zum Zurücksetzen an', async () => {
    const { auth } = renderApp('/passwort-vergessen');
    await userEvent.type(await screen.findByLabelText('E-Mail'), 'max@revier.de');
    await userEvent.click(screen.getByRole('button', { name: 'Link senden' }));
    expect(await screen.findByRole('status')).toHaveTextContent('die E-Mail unterwegs');
    expect(auth.calls).toEqual(['reset:max@revier.de']);
  });

  it('führt nach dem Link aus der Mail zum neuen Passwort und speichert es', async () => {
    const auth = new FakeAuth();
    renderApp('/anmelden', { auth });
    await heading('Anmelden');
    auth.openRecoveryLink('max@revier.de');
    expect(await heading('Neues Passwort')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Neues Passwort'), 'waidmann2');
    await userEvent.type(screen.getByLabelText('Passwort bestätigen'), 'waidmann2');
    await userEvent.click(screen.getByRole('button', { name: 'Passwort speichern' }));
    await waitFor(() => expect(auth.calls).toContain('updatePassword'));
    expect(auth.passwords.get('max@revier.de')).toBe('waidmann2');
  });
});
