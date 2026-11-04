import { CheckCircle2, CircleAlert } from 'lucide-react';
import { Card, Page } from '../../components/ui';
import { configProblems } from '../../lib/config';
import { InstallHint } from './InstallHint';

export function OverviewPage() {
  return (
    <Page title="Übersicht">
      <InstallHint />
      <Card>
        <h2 className="mb-2 font-semibold">Verbindung</h2>
        {configProblems.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 aria-hidden className="size-4" /> Mit Supabase konfiguriert.
          </p>
        ) : (
          <div className="text-sm">
            <p className="flex items-center gap-2 font-medium text-signal">
              <CircleAlert aria-hidden className="size-4" /> Noch nicht mit Supabase verbunden.
            </p>
            <ul className="mt-2 list-disc pl-5 text-muted">
              {configProblems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      <Card>
        <h2 className="mb-1 font-semibold">Neue Web-App im Aufbau</h2>
        <p className="text-sm text-muted">
          Dies ist das Grundgerüst der neuen Drückjagd-App. Anmeldung, Gruppen, Reviere und Jagden folgen in den nächsten
          Schritten und nutzen dieselben Konten und Daten wie die bisherige App.
        </p>
      </Card>
    </Page>
  );
}
