import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MovedBanner } from './MovedBanner';
import { movedTarget, stripLegacyPrefix } from './moved';

const HOME = 'https://www.revier-fuenfzehnhoefe.de/';

describe('Umzug auf die eigene Domain', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('zeigt den Hinweis nur unter einer anderen Adresse', () => {
    expect(movedTarget(HOME, 'https://chrisjaeger234.github.io')).toBe(HOME);
    expect(movedTarget(HOME, 'https://www.revier-fuenfzehnhoefe.de')).toBeNull();
    expect(movedTarget(undefined, 'https://chrisjaeger234.github.io')).toBeNull();
    expect(movedTarget('http://unsicher.example/', 'https://chrisjaeger234.github.io')).toBeNull();
    expect(movedTarget('kaputt', 'https://chrisjaeger234.github.io')).toBeNull();
  });

  it('biegt alte /app/-Pfade nur im Wurzelverzeichnis um', () => {
    expect(stripLegacyPrefix('/', '/app/')).toBe('/');
    expect(stripLegacyPrefix('/', '/app')).toBe('/');
    expect(stripLegacyPrefix('/', '/app/chat/g1')).toBe('/chat/g1');
    expect(stripLegacyPrefix('/', '/apple')).toBeNull();
    expect(stripLegacyPrefix('/', '/chat/g1')).toBeNull();
    expect(stripLegacyPrefix('/drueckjagdApp/app/', '/drueckjagdApp/app/chat')).toBeNull();
  });

  it('verlinkt die neue Adresse', () => {
    vi.stubEnv('VITE_NEW_HOME', HOME);
    render(<MovedBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent('Die App hat eine neue Adresse.');
    expect(screen.getByRole('link', { name: /www\.revier-fuenfzehnhoefe\.de/ })).toHaveAttribute('href', HOME);
  });

  it('bleibt ohne neue Adresse unsichtbar', () => {
    vi.stubEnv('VITE_NEW_HOME', '');
    const { container } = render(<MovedBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
