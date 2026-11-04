import { Layers, LocateFixed } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui';
import { Field, FormError, TextArea } from '../../components/form';
import { mapError } from '../../lib/errors';
import * as V from '../../lib/validators';
import { LAYERS, type LayerId } from '../../modules/map/layers';
import type { PositionState } from '../../modules/map/useOwnPosition';
import { WAYPOINT_CATEGORIES, type WaypointCategory, type WaypointInput } from './revierModel';

const chip = 'inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium';

export function MapToolbar({
  layer,
  onLayer,
  locate,
  onLocate,
  position,
}: {
  layer: LayerId;
  onLayer: (l: LayerId) => void;
  locate: boolean;
  onLocate: (v: boolean) => void;
  position: PositionState;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <div role="group" aria-label="Kartentyp" className="flex gap-1">
          {(Object.keys(LAYERS) as LayerId[]).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={layer === l}
              onClick={() => onLayer(l)}
              className={`${chip} ${layer === l ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface'}`}
            >
              {l === 'luftbild' && <Layers aria-hidden className="size-4" />}
              {LAYERS[l].label}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={locate}
          onClick={() => onLocate(!locate)}
          className={`${chip} ml-auto ${locate ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface'}`}
        >
          <LocateFixed aria-hidden className="size-4" /> Mein Standort
        </button>
      </div>
      {position.status === 'waiting' && <p className="text-sm text-muted">Standort wird gesucht …</p>}
      {position.status === 'ok' && <p className="text-sm text-muted">Genauigkeit etwa {Math.round(position.position.accuracy)} m. Nur für dich sichtbar.</p>}
      {position.status === 'error' && <p className="text-sm text-danger">{position.message}</p>}
    </div>
  );
}

const nameValidator = (v: string) => (v.trim().length === 0 ? 'Bitte gib einen Namen ein.' : V.maxLength(120)(v));

export function WaypointForm({
  initial,
  lat,
  lng,
  pending,
  error,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: { name: string; description: string; category: WaypointCategory };
  lat: number;
  lng: number;
  pending: boolean;
  error: unknown;
  submitLabel: string;
  onSubmit: (input: WaypointInput) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState<WaypointCategory>(initial?.category ?? 'hochsitz');
  const [touched, setTouched] = useState(false);
  const errors = { name: nameValidator(name), description: V.maxLength(2000)(description) };

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (errors.name || errors.description) return;
    onSubmit({ name, description, category, lat, lng });
  }

  return (
    <form noValidate onSubmit={submit} className="grid gap-3">
      <label className="grid gap-1 text-sm font-medium">
        Art der Einrichtung
        <select value={category} onChange={(e) => setCategory(e.target.value as WaypointCategory)} className="min-h-11 rounded-xl border border-line bg-surface px-3 font-normal">
          {WAYPOINT_CATEGORIES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <Field label="Name" placeholder="z. B. Bock 12" value={name} onChange={(e) => setName(e.target.value)} error={touched ? errors.name : undefined} />
      <TextArea label="Hinweise (optional)" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} error={touched ? errors.description : undefined} />
      <p className="text-xs text-muted">
        Position {lat.toFixed(5)}, {lng.toFixed(5)}
      </p>
      <FormError message={error ? mapError(error).message : null} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Speichern …' : submitLabel}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
