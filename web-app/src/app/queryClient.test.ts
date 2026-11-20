import { QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from './App';

describe('createQueryClient', () => {
  afterEach(() => vi.useRealTimers());

  it('behält nicht angezeigte Daten länger als 5 Minuten (für den Offline-Speicher)', async () => {
    vi.useFakeTimers();
    const client = createQueryClient();
    const observer = new QueryObserver(client, { queryKey: ['reviere', 'one', 'r1'], queryFn: async () => ({ name: 'Hohe Buche' }) });
    const unsubscribe = observer.subscribe(() => undefined);
    await vi.waitFor(() => expect(client.getQueryData(['reviere', 'one', 'r1'])).toEqual({ name: 'Hohe Buche' }));
    unsubscribe(); // Seite verlassen

    await vi.advanceTimersByTimeAsync(1000 * 60 * 60); // eine Stunde später
    expect(client.getQueryData(['reviere', 'one', 'r1'])).toEqual({ name: 'Hohe Buche' });
  });
});
