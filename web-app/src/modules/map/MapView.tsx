import maplibregl, { type GeoJSONSource, type Map as MlMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, Position } from 'geojson';
import { useEffect, useRef, useState } from 'react';
import { categoryColor, CATEGORY_LABEL, type Boundary, type Waypoint } from '../../features/reviere/revierModel';
import { DEFAULT_CENTER, type Bbox } from './geo';
import { baseStyle, nrwDopUrl, type LayerId } from './layers';

export interface OwnPosition {
  lat: number;
  lng: number;
  accuracy: number;
}

export interface MapViewProps {
  layer: LayerId;
  boundaries?: { id: string; geometry: Boundary }[];
  waypoints?: Waypoint[];
  /** Eckpunkte einer Grenze, die gerade gezeichnet wird. */
  draft?: Position[];
  position?: OwnPosition | null;
  /** Ausschnitt, auf den beim Laden bzw. bei Änderung von `fitKey` gezoomt wird. */
  fit?: Bbox | null;
  fitKey?: string;
  onMapClick?: (lngLat: { lng: number; lat: number }) => void;
  onWaypointClick?: (w: Waypoint) => void;
  className?: string;
}

let protocolAdded = false;
function ensureProtocol() {
  if (protocolAdded) return;
  protocolAdded = true;
  maplibregl.addProtocol('nrwdop', async (params, abort) => {
    const [z, x, y] = params.url.replace('nrwdop://', '').split('/').map(Number) as [number, number, number];
    const res = await fetch(nrwDopUrl(z, x, y), { signal: abort.signal });
    if (!res.ok) throw new Error(`Kachel ${res.status}`);
    return { data: await res.arrayBuffer() };
  });
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

function boundaryCollection(list: { id: string; geometry: Boundary }[]): FeatureCollection {
  return { type: 'FeatureCollection', features: list.map((b) => ({ type: 'Feature', id: b.id, properties: {}, geometry: b.geometry })) };
}

function draftCollection(points: Position[]): FeatureCollection {
  if (points.length === 0) return EMPTY;
  const ring = points.length >= 3 ? [...points, points[0]!] : points;
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ring } },
      ...points.map((p) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: p } })),
    ],
  };
}

function addOverlays(map: MlMap) {
  map.addSource('boundaries', { type: 'geojson', data: EMPTY });
  map.addLayer({ id: 'boundaries-fill', type: 'fill', source: 'boundaries', paint: { 'fill-color': '#e0a526', 'fill-opacity': 0.12 } });
  map.addLayer({ id: 'boundaries-line', type: 'line', source: 'boundaries', paint: { 'line-color': '#e0a526', 'line-width': 3 } });
  map.addSource('draft', { type: 'geojson', data: EMPTY });
  map.addLayer({ id: 'draft-line', type: 'line', source: 'draft', filter: ['==', '$type', 'LineString'], paint: { 'line-color': '#d9480f', 'line-width': 3, 'line-dasharray': [2, 1] } });
  map.addLayer({
    id: 'draft-points',
    type: 'circle',
    source: 'draft',
    filter: ['==', '$type', 'Point'],
    paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-stroke-color': '#d9480f', 'circle-stroke-width': 3 },
  });
}

export default function MapView({ layer, boundaries = [], waypoints = [], draft = [], position, fit, fitKey, onMapClick, onWaypointClick, className = '' }: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [styleVersion, setStyleVersion] = useState(0);
  const ready = styleVersion > 0;
  const handlers = useRef({ onMapClick, onWaypointClick });
  useEffect(() => {
    handlers.current = { onMapClick, onWaypointClick };
  });

  useEffect(() => {
    ensureProtocol();
    const map = new maplibregl.Map({
      container: container.current!,
      style: baseStyle(layer),
      center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
      zoom: 13,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.on('click', (e) => handlers.current.onMapClick?.({ lng: e.lngLat.lng, lat: e.lngLat.lat }));
    // 'style.load' statt 'load': 'load' wartet auf die ersten Kacheln, die im Wald oder ohne Netz
    // lange ausbleiben können. Grenzen und Entwürfe sollen trotzdem sofort erscheinen.
    // Feuert auch nach jedem setStyle (Kartentyp-Wechsel); dann werden die Overlays neu angelegt.
    map.on('style.load', () => {
      addOverlays(map);
      setStyleVersion((v) => v + 1);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      setStyleVersion(0);
    };
    // Die Karte wird nur einmal erzeugt; der Kartentyp wechselt unten über setStyle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kartentyp wechseln, Overlays danach neu anlegen.
  const firstLayer = useRef(layer);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || layer === firstLayer.current) return;
    firstLayer.current = layer;
    map.setStyle(baseStyle(layer), { diff: false });
  }, [layer]);

  useEffect(() => {
    const source = ready ? (mapRef.current?.getSource('boundaries') as GeoJSONSource | undefined) : undefined;
    if (!source) return;
    source.setData(boundaryCollection(boundaries));
    // Für Tests sichtbar, wie viele Grenzen tatsächlich in der Karte liegen.
    container.current!.dataset.boundaries = String(boundaries.length);
  }, [ready, styleVersion, boundaries]);

  useEffect(() => {
    if (ready) (mapRef.current?.getSource('draft') as GeoJSONSource | undefined)?.setData(draftCollection(draft));
  }, [ready, styleVersion, draft]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers: Marker[] = waypoints.map((w) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'map-waypoint';
      el.style.setProperty('--wp-color', categoryColor(w.category));
      el.setAttribute('aria-label', `${CATEGORY_LABEL[w.category]} ${w.name}`);
      el.innerHTML = '<span class="map-waypoint-dot"></span><span class="map-waypoint-label"></span>';
      el.querySelector('.map-waypoint-label')!.textContent = w.name;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        handlers.current.onWaypointClick?.(w);
      });
      return new maplibregl.Marker({ element: el, anchor: 'left', offset: [-8, 0] }).setLngLat([w.lng, w.lat]).addTo(map);
    });
    return () => markers.forEach((m) => m.remove());
  }, [waypoints]);

  const posMarker = useRef<Marker | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!position) {
      posMarker.current?.remove();
      posMarker.current = null;
      return;
    }
    if (!posMarker.current) {
      const el = document.createElement('div');
      el.className = 'map-position';
      el.setAttribute('aria-label', 'Mein Standort');
      posMarker.current = new maplibregl.Marker({ element: el }).setLngLat([position.lng, position.lat]).addTo(map);
    } else posMarker.current.setLngLat([position.lng, position.lat]);
  }, [position]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fit) return;
    if (fit.west === fit.east && fit.south === fit.north) map.jumpTo({ center: [fit.west, fit.south], zoom: 16 });
    else map.fitBounds([fit.west, fit.south, fit.east, fit.north], { padding: 40, maxZoom: 17, duration: 0 });
    // Nur bei neuem Ausschnitt-Schlüssel zoomen, nicht bei jeder Datenänderung.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, fit === null]);

  return <div ref={container} className={`map-view ${className}`} data-testid="map" />;
}
