import type { MultiPolygon } from 'geojson';
import { Undo2 } from 'lucide-react';
import { Badge, Button, Card } from '../../components/ui';
import { FormError } from '../../components/form';
import { mapError } from '../../lib/errors';
import { CATEGORY_LABEL, categoryColor, WAYPOINT_CATEGORIES, type WaypointCategory } from './revierModel';
import type { ImportWaypoint } from './revierImport';

export type RevierImportSelection = {
  fileName: string;
  boundary: { use: boolean; geometry: MultiPolygon; hectares: number } | null;
  waypoints: (ImportWaypoint & { use: boolean })[];
};

const select = 'min-h-11 rounded-xl border border-line bg-surface px-2 text-sm';
const check = 'size-5 shrink-0 accent-[var(--color-primary)]';
const hectares = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

const ACTION_BADGE: Record<ImportWaypoint['action'], string | null> = { new: null, update: 'wird aktualisiert', same: 'gibt es schon' };

export const selectedCounts = (s: RevierImportSelection) => {
  const chosen = s.waypoints.filter((w) => w.use && w.action !== 'same');
  return { creates: chosen.filter((w) => w.action === 'new').length, updates: chosen.filter((w) => w.action === 'update').length, boundary: !!s.boundary?.use };
};

function saveLabel(s: RevierImportSelection) {
  const { creates, updates, boundary } = selectedCounts(s);
  const parts = [
    boundary ? 'Grenze' : null,
    creates ? `${creates} ${creates === 1 ? 'Einrichtung' : 'Einrichtungen'}` : null,
    updates ? `${updates} ${updates === 1 ? 'Änderung' : 'Änderungen'}` : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(', ')} übernehmen` : 'Nichts ausgewählt';
}

/** Vorschau eines Datei-Imports ins Revier: Grenze und Einrichtungen auswählen, Art anpassen, übernehmen. */
export function RevierImportCard({
  selection,
  hasBoundary,
  onChange,
  onSave,
  onCancel,
  pending,
  error,
}: {
  selection: RevierImportSelection;
  hasBoundary: boolean;
  onChange: (next: RevierImportSelection) => void;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
  error: unknown;
}) {
  const { boundary, waypoints } = selection;
  const counts = selectedCounts(selection);
  const open = waypoints.filter((w) => w.action !== 'same');
  const setWaypoint = (key: string, patch: Partial<RevierImportSelection['waypoints'][number]>) =>
    onChange({ ...selection, waypoints: waypoints.map((w) => (w.key === key ? { ...w, ...patch } : w)) });
  const all = (use: boolean) => onChange({ ...selection, waypoints: waypoints.map((w) => (w.action === 'same' ? w : { ...w, use })) });

  return (
    <Card className="grid gap-4">
      <div>
        <h2 className="font-semibold">Datei importieren</h2>
        <p className="text-sm text-muted">Aus „{selection.fileName}“. Die Vorschau ist in der Karte zu sehen. Wähle aus, was übernommen wird.</p>
      </div>

      {boundary && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className={check} checked={boundary.use} onChange={(e) => onChange({ ...selection, boundary: { ...boundary, use: e.target.checked } })} />
          <span className="font-medium">{hasBoundary ? 'Reviergrenze ersetzen' : 'Reviergrenze übernehmen'}</span>
          <span className="text-muted">ca. {hectares.format(boundary.hectares)} ha</span>
        </label>
      )}

      {waypoints.length > 0 && (
        <section className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Einrichtungen ({counts.creates} neu, {counts.updates} geändert, {waypoints.length - open.length} unverändert)
            </h3>
            {open.length > 0 && (
              <div className="flex gap-2 text-sm">
                <button type="button" className="min-h-11 font-medium text-primary" onClick={() => all(true)}>
                  Alle
                </button>
                <button type="button" className="min-h-11 font-medium text-primary" onClick={() => all(false)}>
                  Keine
                </button>
              </div>
            )}
          </div>
          <ul className="grid gap-1" aria-label="Einrichtungen aus der Datei">
            {waypoints.map((w) => {
              const same = w.action === 'same';
              const badge = ACTION_BADGE[w.action];
              return (
                <li key={w.key} className="flex flex-wrap items-center gap-2">
                  <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-sm">
                    <input type="checkbox" className={check} checked={w.use && !same} disabled={same} onChange={(e) => setWaypoint(w.key, { use: e.target.checked })} />
                    <span className="size-3 shrink-0 rounded-full" style={{ background: categoryColor(w.category) }} />
                    <span className={same ? 'truncate text-muted' : 'truncate font-medium'}>{w.name}</span>
                    {w.generatedName && <Badge>ohne Namen</Badge>}
                    {badge && <Badge>{badge}</Badge>}
                  </label>
                  {same ? (
                    <span className="text-sm text-muted">{CATEGORY_LABEL[w.category]}</span>
                  ) : (
                    <select aria-label={`Art von ${w.name}`} value={w.category} disabled={!w.use} onChange={(e) => setWaypoint(w.key, { category: e.target.value as WaypointCategory })} className={select}>
                      {WAYPOINT_CATEGORIES.map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted">
            Die Art kommt aus dem Symbol der Datei (z. B. Jagdbegleiter) oder aus dem Namen und lässt sich ändern. Vorhandene Einrichtungen werden am Namen erkannt und nicht doppelt angelegt.
          </p>
        </section>
      )}

      <FormError message={error ? mapError(error).message : null} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending || (counts.creates + counts.updates === 0 && !counts.boundary)} onClick={onSave}>
          {pending ? 'Wird gespeichert …' : saveLabel(selection)}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          <Undo2 aria-hidden className="size-4" /> Abbrechen
        </Button>
      </div>
    </Card>
  );
}
