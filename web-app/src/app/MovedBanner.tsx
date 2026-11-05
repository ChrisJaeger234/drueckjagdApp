import { ExternalLink } from 'lucide-react';
import { movedTarget } from './moved';

/** Hinweis in der alten Installation: die App hat eine neue Adresse. */
export function MovedBanner() {
  const target = movedTarget(import.meta.env.VITE_NEW_HOME as string | undefined, window.location.origin);
  if (!target) return null;
  return (
    <div role="alert" className="sticky top-0 z-50 grid gap-1 bg-signal px-4 py-3 text-sm text-white">
      <p className="font-semibold">Die App hat eine neue Adresse.</p>
      <p>
        Bitte dort öffnen, neu anmelden und wieder zum Home-Bildschirm hinzufügen. Dieses Symbol kannst du danach löschen.
      </p>
      <a href={target} className="inline-flex items-center gap-1 font-semibold underline">
        {new URL(target).host} <ExternalLink aria-hidden className="size-4" />
      </a>
    </div>
  );
}
