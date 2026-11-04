import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useState } from 'react';
import type { createAppRouter } from './router';

export function App({ router }: { router: ReturnType<typeof createAppRouter> }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // "offlineFirst": vorhandene Daten zeigen und Anfragen bei fehlendem Netz pausieren.
          queries: { networkMode: 'offlineFirst', staleTime: 30_000, retry: 2 },
          mutations: { networkMode: 'offlineFirst' },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
