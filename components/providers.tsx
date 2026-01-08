'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthProvider } from '@/contexts/auth-context';
import { NotificationPopupProvider } from '@/contexts/notification-popup-context';
import { LocaleSync } from '@/components/locale-sync';
import { Toaster } from '@/components/ui/sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <NotificationPopupProvider>
          <LocaleSync />
          {children}
          <Toaster position="top-right" richColors closeButton />
        </NotificationPopupProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
