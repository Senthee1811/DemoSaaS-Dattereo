'use client';

import React from 'react';
import { ErrorDialogProvider, ToastProvider } from '@/components/ui/feedback';
import { MotionProvider } from '@/components/ui/motion';

/** Client-side providers shared by every page. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionProvider>
      <ToastProvider>
        <ErrorDialogProvider>{children}</ErrorDialogProvider>
      </ToastProvider>
    </MotionProvider>
  );
}
