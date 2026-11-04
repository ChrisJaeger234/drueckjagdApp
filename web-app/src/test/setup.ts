import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => cleanup());

// jsdom kennt kein matchMedia; die App fragt damit den Installationsmodus ab.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
window.scrollTo = () => {};

// MapLibre braucht WebGL, das jsdom nicht hat. In Tests ersetzt eine einfache Attrappe die Karte:
// „Karte antippen“ meldet nacheinander Punkte um den Revier-Mittelpunkt.
vi.mock('../modules/map/MapView', async () => {
  const { createElement } = await import('react');
  let taps = 0;
  return {
    default: (props: import('../modules/map/MapView').MapViewProps) =>
      createElement(
        'div',
        { 'data-testid': 'map', 'data-layer': props.layer, 'data-boundaries': props.boundaries?.length ?? 0, 'data-draft': props.draft?.length ?? 0 },
        createElement(
          'button',
          {
            type: 'button',
            onClick: () => {
              taps++;
              props.onMapClick?.({ lng: 7.25 + (taps % 3) * 0.001, lat: 51.17 + (taps % 2) * 0.001 });
            },
          },
          'Karte antippen',
        ),
        ...(props.waypoints ?? []).map((w) =>
          createElement('button', { key: w.id, type: 'button', onClick: () => props.onWaypointClick?.(w) }, `Marker ${w.name}`),
        ),
      ),
  };
});
