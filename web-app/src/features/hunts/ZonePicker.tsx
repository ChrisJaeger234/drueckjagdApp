// Zonen eines Teilnehmers wählen: eine oder mehrere (Migration 0018).
import { ZONE_KINDS, zoneColor, type Zone } from './huntModel';

const select = 'min-h-10 rounded-xl border border-line bg-surface px-2 text-sm';

export function ZonePicker({
  label,
  zones,
  value,
  multi,
  disabled = false,
  onChange,
}: {
  /** Vorgelesener Name, z. B. „Zone von Max“. */
  label: string;
  zones: Zone[];
  /** Gewählte Zonen, die erste ist die Hauptzone. */
  value: string[];
  /** false, solange die Datenbank nur eine Zone kennt. */
  multi: boolean;
  disabled?: boolean;
  onChange: (zoneIds: string[]) => void;
}) {
  if (!multi) {
    return (
      <select aria-label={label} value={value[0] ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value ? [e.target.value] : [])} className={select}>
        <option value="">Keine Zone</option>
        {zones.map((z) => (
          <option key={z.id} value={z.id}>
            {z.name}
          </option>
        ))}
      </select>
    );
  }
  const chosen = value.map((id) => zones.find((z) => z.id === id)).filter((z): z is Zone => !!z);
  const toggle = (id: string, on: boolean) => onChange(on ? [...value, id] : value.filter((x) => x !== id));
  return (
    <details className="group min-w-0 rounded-xl border border-line bg-surface text-sm">
      <summary className="flex min-h-10 cursor-pointer list-none flex-wrap items-center gap-1 px-2 py-1" aria-label={`${label}: ${chosen.length ? chosen.map((z) => z.name).join(', ') : 'keine'}`}>
        {chosen.length === 0 ? (
          <span className="text-muted">Keine Zone</span>
        ) : (
          chosen.map((z) => (
            <span key={z.id} className="inline-flex items-center gap-1 rounded-lg bg-sand-light/60 px-1.5 py-0.5">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: zoneColor(z) }} />
              {z.name}
            </span>
          ))
        )}
        <span aria-hidden className="ml-auto pl-1 text-muted group-open:rotate-180">▾</span>
      </summary>
      <fieldset className="grid gap-1 border-t border-line px-2 py-2" disabled={disabled}>
        <legend className="sr-only">{label}</legend>
        {zones.map((z) => (
          <label key={z.id} className="flex min-h-9 items-center gap-2">
            <input type="checkbox" className="size-5 shrink-0 accent-[var(--color-primary)]" checked={value.includes(z.id)} onChange={(e) => toggle(z.id, e.target.checked)} />
            <span className="size-3 shrink-0 rounded-sm" style={{ background: zoneColor(z) }} />
            <span className="flex-1">{z.name}</span>
            <span className="text-xs text-muted">{ZONE_KINDS[z.kind]}</span>
          </label>
        ))}
      </fieldset>
    </details>
  );
}
