'use client';

import React from 'react';
import { ErrorDialogProvider, ToastProvider } from '@/components/ui/feedback';

/** Client-side providers shared by every page. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ErrorDialogProvider>{children}</ErrorDialogProvider>
    </ToastProvider>
  );
}
