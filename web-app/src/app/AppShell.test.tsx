import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { createAppRouter } from './router';

function renderAt(path: string) {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [path] }) });
  render(<App router={router} />);
  return router;
}

describe('AppShell', () => {
  it('zeigt die fünf Hauptbereiche wie in der Flutter-App', async () => {
    renderAt('/');
    const nav = await screen.findByRole('navigation', { name: 'Hauptnavigation' });
    const labels = Array.from(nav.querySelectorAll('a')).map((a) => a.textContent);
    expect(labels).toEqual(['Übersicht', 'Karte', 'Gruppe', 'Chat', 'Profil']);
  });

  it('wechselt über die Navigation die Seite und markiert den aktiven Bereich', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Übersicht' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Karte' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Karte' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Karte' })).toHaveAttribute('aria-current', 'page');
  });

  it('meldet eine fehlende Supabase-Konfiguration, statt eine Verbindung vorzutäuschen', async () => {
    renderAt('/');
    expect(await screen.findByText('Noch nicht mit Supabase verbunden.')).toBeInTheDocument();
  });

  it('zeigt für unbekannte Adressen eine Fehlerseite', async () => {
    renderAt('/gibt-es-nicht');
    expect(await screen.findByRole('heading', { level: 1, name: 'Nicht gefunden' })).toBeInTheDocument();
  });
});
