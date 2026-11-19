// Farbe einer Zone wählen: Farbe der Zonenart (Standard), Palette oder eigene Farbe.
import { useEffect, useRef } from 'react';
import { ZONE_COLORS, type ZoneKind } from './huntModel';

/** Auswahl für eigene Zonenfarben; die Farbe der Zonenart bleibt der Standard. */
export const ZONE_PALETTE = ['#2f7d32', '#7cb342', '#00897b', '#1f5c8a', '#4fc3f7', '#5e35b1', '#d81b60', '#b3261e', '#d9480f', '#f9a825', '#795548', '#212121'];

export function ZoneColorChoice({
  label,
  kind,
  value,
  onChange,
}: {
  /** Name der Gruppe, z. B. „Farbe für Treiben 1“. */
  label: string;
  kind: ZoneKind;
  /** Eigene Farbe (#rrggbb) oder null = Farbe der Zonenart. */
  value: string | null;
  onChange: (color: string | null) => void;
}) {
  const current = (value ?? ZONE_COLORS[kind]).toLowerCase();
  // Eigene Farbe: kurz nach der letzten Änderung übernehmen. Der Farbwähler meldet beim Ziehen
  // viele Zwischenwerte, und auf Handys verliert das Feld nach dem Schließen oft nicht den Fokus.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current) latest.current(pending.current);
    pending.current = null;
  };
  useEffect(() => flush, []);
  const custom = (c: string) => {
    pending.current = c.toLowerCase();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 400);
  };
  const ring = (active: boolean) => (active ? 'border-primary ring-2 ring-primary' : 'border-line');
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      <button type="button" aria-pressed={value === null} onClick={() => onChange(null)} className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-2 text-sm ${ring(value === null)}`}>
        <span className="size-5 rounded-md" style={{ background: ZONE_COLORS[kind] }} />
        Wie Art
      </button>
      {ZONE_PALETTE.map((c) => (
        <button key={c} type="button" aria-label={`Farbe ${c}`} aria-pressed={value?.toLowerCase() === c} onClick={() => onChange(c)} className={`size-10 rounded-xl border ${ring(value?.toLowerCase() === c)}`} style={{ background: c }} />
      ))}
      <label className="inline-flex min-h-10 items-center gap-1 text-sm">
        Eigene
        <input
          key={current}
          type="color"
          aria-label={`Eigene ${label}`}
          defaultValue={current}
          onChange={(e) => custom(e.target.value)}
          onBlur={flush}
          className="h-10 w-12 cursor-pointer rounded-xl border border-line bg-surface"
        />
      </label>
    </div>
  );
}
