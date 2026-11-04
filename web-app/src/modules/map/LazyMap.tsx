import { lazy, Suspense } from 'react';
import type { MapViewProps } from './MapView';

// MapLibre ist groß; die Karte wird erst geladen, wenn eine Seite sie braucht.
const MapView = lazy(() => import('./MapView'));

export function LazyMap(props: MapViewProps) {
  return (
    <Suspense fallback={<div className={`map-view grid place-items-center text-sm text-muted ${props.className ?? ''}`}>Karte wird geladen …</div>}>
      <MapView {...props} />
    </Suspense>
  );
}
