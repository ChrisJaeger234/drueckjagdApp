import { Undo2 } from 'lucide-react';
import { Badge, Button, Card } from '../../components/ui';
import { FormError } from '../../components/form';
import { mapError } from '../../lib/errors';
import { ZONE_KINDS, zoneColor, type ZoneKind } from './huntModel';
import type { ImportStand, ImportZone } from './huntImport';

export type ImportSelection = {
  zones: (ImportZone & { use: boolean })[];
  stands: (ImportStand & { use: boolean })[];
};

export const STAND_PREVIEW_COLOR = '#0288d1';

export const countText = (zones: number, stands: number) => `${zones} ${zones === 1 ? 'Zone' : 'Zonen'} und ${stands} ${stands === 1 ? 'Stand' : 'Stände'}`;

const select = 'min-h-11 rounded-xl border border-line bg-surface px-2 text-sm';
const check = 'size-5 shrink-0 accent-[var(--color-primary)]';

/** Vorschau eines Karten-Imports: auswählen, Zonenart festlegen, übernehmen. */
export function HuntImportCard({
  fileName,
  selection,
  onChange,
  onSave,
  onCancel,
  pending,
  error,
}: {
  fileName: string;
  selection: ImportSelection;
  onChange: (next: ImportSelection) => void;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
  error: unknown;
}) {
  const { zones, stands } = selection;
  const zoneCount = zones.filter((z) => z.use).length;
  const standCount = stands.filter((s) => s.use && !s.duplicate).length;
  const setZone = (key: string, patch: Partial<ImportSelection['zones'][number]>) => onChange({ ...selection, zones: zones.map((z) => (z.key === key ? { ...z, ...patch } : z)) });
  const setStand = (key: string, use: boolean) => onChange({ ...selection, stands: stands.map((s) => (s.key === key ? { ...s, use } : s)) });
  const allStands = (use: boolean) => onChange({ ...selection, stands: stands.map((s) => ({ ...s, use })) });

  return (
    <Card className="grid gap-4">
      <div>
        <h2 className="font-semibold">Karte importieren</h2>
        <p className="text-sm text-muted">
          Aus „{fileName}“. Die Vorschau ist in der Karte zu sehen. Wähle aus, was übernommen wird.
        </p>
      </div>

      {zones.length > 0 && (
        <section className="grid gap-2">
          <h3 className="text-sm font-semibold">Flächen werden Zonen ({zoneCount} von {zones.length})</h3>
          <ul className="grid gap-2" aria-label="Zonen aus der Datei">
            {zones.map((z) => (
              <li key={z.key} className="flex flex-wrap items-center gap-2">
                <label className="flex min-h-11 flex-1 items-center gap-2 text-sm">
                  <input type="checkbox" className={check} checked={z.use} onChange={(e) => setZone(z.key, { use: e.target.checked })} />
                  <span className="size-3 shrink-0 rounded-sm" style={{ background: zoneColor(z) }} />
                  <span className="font-medium">{z.name}</span>
                </label>
                <select aria-label={`Art von ${z.name}`} value={z.kind} disabled={!z.use} onChange={(e) => setZone(z.key, { kind: e.target.value as ZoneKind })} className={select}>
                  {(Object.keys(ZONE_KINDS) as ZoneKind[]).map((k) => (
                    <option key={k} value={k}>
                      {ZONE_KINDS[k]}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stands.length > 0 && (
        <section className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Punkte werden Stände ({standCount} von {stands.length})
            </h3>
            <div className="flex gap-2 text-sm">
              <button type="button" className="min-h-11 font-medium text-primary" onClick={() => allStands(true)}>
                Alle
              </button>
              <button type="button" className="min-h-11 font-medium text-primary" onClick={() => allStands(false)}>
                Keine
              </button>
            </div>
          </div>
          <ul className="grid gap-1" aria-label="Stände aus der Datei">
            {stands.map((s) => (
              <li key={s.key}>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" className={check} checked={s.use && !s.duplicate} disabled={s.duplicate} onChange={(e) => setStand(s.key, e.target.checked)} />
                  <span className="size-3 shrink-0 rounded-full" style={{ background: STAND_PREVIEW_COLOR }} />
                  <span className={s.duplicate ? 'text-muted line-through' : 'font-medium'}>{s.label}</span>
                  {s.duplicate && <Badge>gibt es schon</Badge>}
                </label>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Treffpunkte und Startpunkte kannst du ebenfalls als Stand übernehmen, dann stehen sie mit Namen in der Karte. Schützen teilst du danach wie gewohnt zu.</p>
        </section>
      )}

      <FormError message={error ? mapError(error).message : null} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending || zoneCount + standCount === 0} onClick={onSave}>
          {pending ? 'Wird gespeichert …' : `${countText(zoneCount, standCount)} übernehmen`}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          <Undo2 aria-hidden className="size-4" /> Abbrechen
        </Button>
      </div>
    </Card>
  );
}
