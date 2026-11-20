import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useState } from 'react';
import { MAX_AGE } from '../lib/offline';
import { AuthProvider } from '../features/auth/AuthContext';
import type { createAppRouter } from './router';
import { MovedBanner } from './MovedBanner';
import { OfflineSync } from './OfflineSync';
import { ServicesProvider, type Services } from './services';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      // "offlineFirst": vorhandene Daten zeigen und Anfragen bei fehlendem Netz pausieren.
      // gcTime so lang wie die Speicherdauer auf dem Gerät: sonst verwirft TanStack Query Daten, die
      // 5 Minuten nicht angezeigt wurden (z. B. das Revier), auch aus dem Offline-Speicher.
      queries: { networkMode: 'offlineFirst', staleTime: 30_000, retry: 2, gcTime: MAX_AGE },
      mutations: { networkMode: 'offlineFirst' },
    },
  });
}

export function App({
  router,
  services,
  queryClient,
  persist = false,
}: {
  router: ReturnType<typeof createAppRouter>;
  services: Services;
  queryClient?: QueryClient;
  /** Daten in IndexedDB speichern (in der App an, in Tests aus). */
  persist?: boolean;
}) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <ServicesProvider services={services}>
      <QueryClientProvider client={client}>
        <AuthProvider service={services.auth}>
          <OfflineSync persist={persist} />
          <MovedBanner />
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </ServicesProvider>
  );
}
