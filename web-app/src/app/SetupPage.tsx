import { CircleAlert } from 'lucide-react';
import { configProblems } from '../lib/config';

/** Wird gezeigt, wenn die Supabase-Verbindung nicht konfiguriert ist (keine Scheinverbindung). */
export function SetupPage() {
  return (
    <div className="mx-auto max-w-md px-4 pt-[calc(env(safe-area-inset-top)+40px)]">
      <h1 className="mb-3 text-2xl font-semibold">Einrichtung nötig</h1>
      <div className="rounded-2xl border border-line bg-surface p-5 text-sm">
        <p className="flex items-center gap-2 font-medium text-signal">
          <CircleAlert aria-hidden className="size-4" /> Noch nicht mit Supabase verbunden.
        </p>
        <ul className="mt-2 list-disc pl-5 text-muted">
          {configProblems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="mt-3 text-muted">Die Werte werden beim Bauen der App gesetzt (siehe web-app/README.md).</p>
      </div>
    </div>
  );
}
