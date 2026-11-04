import { CloudDownload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Choice, FormError } from '../../components/form';
import { Badge, Button, Card, ConfirmButton } from '../../components/ui';
import { useOnline } from '../../lib/useOnline';
import { padBbox, type Bbox } from '../../modules/map/geo';
import { LAYER_IDS, LAYERS, type LayerId } from '../../modules/map/layers';
import { countPack, estimatePack, formatMb, MAX_PACK_TILES, offlineMapsSupported, type OfflinePack } from '../../modules/map/tileStore';
import { useOfflinePack, usePackDownload } from './useOfflinePacks';

/** Rand ums Revier, damit auch Nachsuchen knapp über die Grenze hinaus auf der Karte bleiben. */
const PADDING_METERS = 500;

const DETAIL = [
  { value: 15, label: 'Grob' },
  { value: 17, label: 'Standard' },
  { value: 18, label: 'Fein' },
];

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function packSummary(p: OfflinePack): string {
  const layers = p.layers.map((l) => LAYERS[l].label).join(' und ');
  return `${layers}, ${(p.tiles - p.failed).toLocaleString('de-DE')} Kacheln, ${formatMb(p.bytes)}, Stand ${formatDate(p.savedAt)}`;
}

/** Karte des Reviers für Funklöcher vorab aufs Gerät laden. */
export function OfflineMapCard({ revierId, name, area }: { revierId: string; name: string; area: Bbox | null }) {
  const pack = useOfflinePack(revierId);
  const online = useOnline();
  const download = usePackDownload();
  const [layers, setLayers] = useState<LayerId[]>(pack?.layers ?? ['karte']);
  const [maxZoom, setMaxZoom] = useState(pack?.maxZoom ?? 17);
  const bbox = useMemo(() => (area ? padBbox(area, PADDING_METERS) : null), [area]);
  const count = bbox ? countPack(bbox, layers, maxZoom) : 0;
  const bytes = bbox ? estimatePack(bbox, layers, maxZoom) : 0;
  const tooBig = count > MAX_PACK_TILES;

  if (!offlineMapsSupported()) {
    return (
      <Card>
        <h2 className="mb-1 font-semibold">Karte offline</h2>
        <p className="text-sm text-muted">Dieser Browser kann keine Karten offline speichern.</p>
      </Card>
    );
  }

  const toggleLayer = (l: LayerId) => setLayers((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : LAYER_IDS.filter((x) => x === l || cur.includes(x))));
  const p = download.progress;
  const percent = p && p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;

  return (
    <Card className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Karte offline</h2>
        {pack && <Badge tone={pack.complete && pack.failed === 0 ? 'primary' : 'signal'}>{pack.complete ? 'gespeichert' : 'unvollständig'}</Badge>}
      </div>
      {pack ? (
        <p className="text-sm" data-testid="pack-summary">
          {packSummary(pack)}
          {pack.failed > 0 && ` · ${pack.failed.toLocaleString('de-DE')} Kacheln fehlen, bitte mit Netz aktualisieren`}
        </p>
      ) : (
        <p className="text-sm text-muted">Lade die Karte im WLAN, dann siehst du sie auch im Funkloch. Grenzen, Einrichtungen und Jagden sind ohnehin auf dem Gerät gespeichert.</p>
      )}

      {!bbox ? (
        <p className="text-sm text-muted">Lege zuerst eine Reviergrenze oder Einrichtungen an, damit das Gebiet feststeht.</p>
      ) : p ? (
        <div className="grid gap-2" aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-sand-light" role="progressbar" aria-label="Download" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-sm">
            {p.done.toLocaleString('de-DE')} von {p.total.toLocaleString('de-DE')} Kacheln · {formatMb(p.bytes)}
            {p.failed > 0 && ` · ${p.failed} fehlgeschlagen`}
          </p>
          <p className="text-sm text-muted">Bitte die App geöffnet lassen.</p>
          <Button variant="secondary" onClick={download.cancel}>
            Abbrechen
          </Button>
        </div>
      ) : (
        <>
          <fieldset className="grid gap-1">
            <legend className="mb-1 text-sm font-medium">Kartentypen</legend>
            <div className="flex flex-wrap gap-4">
              {LAYER_IDS.map((l) => (
                <label key={l} className="flex min-h-10 items-center gap-2 text-sm">
                  <input type="checkbox" checked={layers.includes(l)} onChange={() => toggleLayer(l)} className="size-5 accent-[var(--color-primary)]" />
                  {LAYERS[l].label}
                </label>
              ))}
            </div>
          </fieldset>
          <Choice label="Detailstufe" options={DETAIL} value={maxZoom} onChange={setMaxZoom} />
          <p className="text-sm text-muted" data-testid="pack-estimate">
            {count.toLocaleString('de-DE')} Kacheln, etwa {formatMb(bytes)}
            {tooBig && '. Das ist zu viel, bitte eine gröbere Stufe oder weniger Kartentypen wählen.'}
          </p>
          <Button disabled={!online || layers.length === 0 || tooBig} onClick={() => void download.start({ revierId, name, bbox, layers, maxZoom })}>
            <CloudDownload aria-hidden className="size-4" /> {pack ? 'Offline-Karte aktualisieren' : 'Karte offline speichern'}
          </Button>
          {!online && <p className="text-sm text-muted">Zum Laden wird eine Netzverbindung gebraucht.</p>}
          {pack && <ConfirmButton label="Offline-Karte löschen" confirmText={`Offline-Karte von „${name}“ vom Gerät löschen?`} confirmLabel="Löschen" onConfirm={() => void download.remove(revierId)} />}
        </>
      )}
      <FormError message={download.error} />
    </Card>
  );
}
