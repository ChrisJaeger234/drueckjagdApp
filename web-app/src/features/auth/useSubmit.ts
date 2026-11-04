import { useState } from 'react';
import { mapError, type AppError } from '../../lib/errors';

/** Kleiner Helfer für Formulare: Ladezustand und übersetzter Fehler. */
export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      return await action();
    } catch (e) {
      setError(mapError(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}
