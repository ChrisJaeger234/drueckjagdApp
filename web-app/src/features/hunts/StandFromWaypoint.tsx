import { MapPinPlus } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card } from '../../components/ui';
import { Field, FormError } from '../../components/form';
import { mapError } from '../../lib/errors';
import { CATEGORY_LABEL, WAYPOINT_CATEGORIES, type Waypoint, type WaypointCategory } from '../reviere/revierModel';

const selectClass = 'min-h-11 rounded-xl border border-line bg-surface px-3 font-normal';

/** Auswahl der Art eines Standes; leer = „Stand“ ohne Angabe. */
export function StandCategorySelect({ value, onChange, label = 'Art' }: { value: WaypointCategory | null; onChange: (v: WaypointCategory | null) => void; label?: string }) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <select value={value ?? ''} onChange={(e) => onChange((e.target.value || null) as WaypointCategory | null)} className={selectClass}>
        <option value="">Stand</option>
        {WAYPOINT_CATEGORIES.map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export const standCategoryText = (c: WaypointCategory | null) => (c ? CATEGORY_LABEL[c] : null);

/** Einrichtung des Reviers als Stand der Jagd übernehmen; Name und Art sind vorbelegt und änderbar. */
export function StandFromWaypointCard({
  waypoint,
  pending,
  error,
  onSave,
  onCancel,
}: {
  waypoint: Waypoint;
  pending: boolean;
  error: unknown;
  onSave: (label: string, category: WaypointCategory | null) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(waypoint.name.slice(0, 60));
  const [category, setCategory] = useState<WaypointCategory | null>(waypoint.category);
  const invalid = label.trim().length === 0 || label.trim().length > 60;
  return (
    <Card className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Als Stand übernehmen</h2>
        <Badge>{CATEGORY_LABEL[waypoint.category]}</Badge>
      </div>
      <p className="text-sm text-muted">„{waypoint.name}“ aus dem Revier. Name und Art gelten nur für diese Jagd; im Revier bleibt alles unverändert.</p>
      <form
        noValidate
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) onSave(label.trim(), category);
        }}
      >
        <Field label="Name in der Jagd" value={label} onChange={(e) => setLabel(e.target.value)} error={invalid ? 'Bitte gib eine Bezeichnung mit bis zu 60 Zeichen ein.' : undefined} />
        <StandCategorySelect value={category} onChange={setCategory} />
        <FormError message={error ? mapError(error).message : null} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || invalid}>
            <MapPinPlus aria-hidden className="size-4" /> Als Stand übernehmen
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Abbrechen
          </Button>
        </div>
      </form>
    </Card>
  );
}

/**
 * Noch nicht übernommene Einrichtungen des Reviers. Nur die Planung sieht sie; für alle anderen
 * zeigt die Jagd ausschließlich die angehakten und übernommenen Einrichtungen (als Stände).
 */
export function RevierWaypointsCard({
  waypoints,
  onPick,
  onAdoptMany,
  pending,
  error,
}: {
  waypoints: Waypoint[];
  onPick: (w: Waypoint) => void;
  onAdoptMany: (list: Waypoint[]) => void;
  pending: boolean;
  error: unknown;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  if (waypoints.length === 0) return null;
  const chosen = waypoints.filter((w) => checked.has(w.id));
  const categories = WAYPOINT_CATEGORIES.filter(([k]) => waypoints.some((w) => w.category === k));
  const toggle = (id: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const toggleCategory = (c: WaypointCategory) => {
    const ids = waypoints.filter((w) => w.category === c).map((w) => w.id);
    const all = ids.every((id) => checked.has(id));
    setChecked((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (all ? next.delete(id) : next.add(id)));
      return next;
    });
  };
  return (
    <Card>
      <details>
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Einrichtungen aus dem Revier ({waypoints.length})</summary>
        <p className="mb-2 text-sm text-muted">
          Nur für die Planung sichtbar (grau in der Karte). Hake an, was für diese Jagd gebraucht wird: Nur übernommene Einrichtungen sehen alle Teilnehmer.
        </p>
        <div className="mb-2 flex flex-wrap gap-2" aria-label="Nach Art auswählen">
          {categories.map(([k, l]) => (
            <button key={k} type="button" className="min-h-11 rounded-xl border border-line px-3 text-sm" onClick={() => toggleCategory(k)}>
              Alle {l}
            </button>
          ))}
        </div>
        <ul className="grid gap-1" aria-label="Einrichtungen aus dem Revier">
          {waypoints.map((w) => (
            <li key={w.id} className="flex items-center gap-2">
              <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2">
                <input type="checkbox" className="size-5 shrink-0 accent-[var(--color-primary)]" checked={checked.has(w.id)} onChange={(e) => toggle(w.id, e.target.checked)} />
                <span className="truncate font-medium">{w.name}</span>
              </label>
              <Badge>{CATEGORY_LABEL[w.category]}</Badge>
              <Button variant="secondary" aria-label={`${w.name} übernehmen`} onClick={() => onPick(w)}>
                <MapPinPlus aria-hidden className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
        <FormError message={error ? mapError(error).message : null} />
        <Button
          className="mt-2"
          disabled={pending || chosen.length === 0}
          onClick={() => {
            onAdoptMany(chosen);
            setChecked(new Set());
          }}
        >
          <MapPinPlus aria-hidden className="size-4" /> {pending ? 'Wird übernommen …' : `${chosen.length} ${chosen.length === 1 ? 'Einrichtung' : 'Einrichtungen'} übernehmen`}
        </Button>
      </details>
    </Card>
  );
}
