import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp, signedIn } from '../test/renderApp';

describe('AppShell', () => {
  it('zeigt die fünf Hauptbereiche wie in der Flutter-App', async () => {
    renderApp('/', { auth: signedIn() });
    const nav = await screen.findByRole('navigation', { name: 'Hauptnavigation' });
    const labels = Array.from(nav.querySelectorAll('a')).map((a) => a.textContent);
    expect(labels).toEqual(['Übersicht', 'Karte', 'Gruppe', 'Chat', 'Profil']);
  });

  it('wechselt über die Navigation die Seite und markiert den aktiven Bereich', async () => {
    renderApp('/', { auth: signedIn() });
    expect(await screen.findByRole('heading', { level: 1, name: 'Übersicht' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Karte' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Karte' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Karte' })).toHaveAttribute('aria-current', 'page');
  });

  it('zeigt für unbekannte Adressen eine Fehlerseite', async () => {
    renderApp('/gibt-es-nicht', { auth: signedIn() });
    expect(await screen.findByRole('heading', { level: 1, name: 'Nicht gefunden' })).toBeInTheDocument();
  });
});
