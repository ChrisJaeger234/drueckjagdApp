import { Share, X } from 'lucide-react';
import { useState } from 'react';
import { Card } from '../../components/ui';

const DISMISS_KEY = 'install-hint-dismissed';

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Anleitung zum Installieren, solange die App im Browser-Tab läuft. */
export function InstallHint() {
  const [dismissed, setDismissed] = useState(readDismissed);
  if (dismissed || isStandalone()) return null;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* privater Modus: Hinweis erscheint beim nächsten Start wieder */
    }
  };
  return (
    <Card className="relative border-signal/60">
      <button type="button" onClick={dismiss} aria-label="Hinweis schließen" className="absolute right-2 top-2 grid size-9 place-items-center text-muted">
        <X aria-hidden className="size-4" />
      </button>
      <h2 className="mb-1 pr-8 font-semibold">App installieren</h2>
      {ios ? (
        <p className="text-sm text-muted">
          In Safari unten auf <Share aria-label="Teilen" className="inline size-4 align-text-bottom" /> tippen, dann
          „Zum Home-Bildschirm“. Nur so bekommst du auf dem iPhone Benachrichtigungen.
        </p>
      ) : (
        <p className="text-sm text-muted">Im Browsermenü „App installieren“ bzw. „Zum Startbildschirm hinzufügen“ wählen.</p>
      )}
    </Card>
  );
}
