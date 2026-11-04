import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useState } from 'react';
import { AuthProvider } from '../features/auth/AuthContext';
import type { createAppRouter } from './router';
import { OfflineSync } from './OfflineSync';
import { ServicesProvider, type Services } from './services';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      // "offlineFirst": vorhandene Daten zeigen und Anfragen bei fehlendem Netz pausieren.
      queries: { networkMode: 'offlineFirst', staleTime: 30_000, retry: 2 },
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
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </ServicesProvider>
  );
}
