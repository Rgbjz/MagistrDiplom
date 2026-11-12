'use client';

import { SessionProvider } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ToastProvider } from '../components/ui/Toast';
import { CallProvider } from '../components/call/CallProvider';
import { LocaleSync } from '../i18n/LocaleSync';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 4xx (not enrolled, not found, forbidden) won't change on retry —
            // show the error state at once; retry network/5xx errors twice.
            retry: (failureCount, error) =>
              !/API 4\d\d/.test(error instanceof Error ? error.message : '') &&
              failureCount < 2,
          },
        },
      }),
  );
  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <LocaleSync />
          <CallProvider>{children}</CallProvider>
        </ToastProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
