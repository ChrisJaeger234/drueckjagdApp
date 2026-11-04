import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useState } from 'react';
import { AuthProvider } from '../features/auth/AuthContext';
import type { createAppRouter } from './router';
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

export function App({ router, services, queryClient }: { router: ReturnType<typeof createAppRouter>; services: Services; queryClient?: QueryClient }) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <ServicesProvider services={services}>
      <QueryClientProvider client={client}>
        <AuthProvider service={services.auth}>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </ServicesProvider>
  );
}
