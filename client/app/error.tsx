'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('SpendGuard Application Exception:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-surface-subtle text-fg flex flex-col justify-between p-6 antialiased selection:bg-accent selection:text-white">
      {/* Brand Header */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-menu bg-accent flex items-center justify-center text-white shadow-xs">
            <ShieldCheck className="w-4 h-4 text-white" strokeWidth={2.4} />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 leading-none">
              <span className="font-serif font-medium tracking-tight text-fg text-sm">SpendGuard</span>
              <Badge mono className="uppercase tracking-wider">AI</Badge>
            </div>
            <span className="text-caption text-fg-muted font-mono mt-0.5">by Dattreo</span>
          </div>
        </Link>
      </header>

      {/* Main Error Box */}
      <main className="max-w-md w-full mx-auto my-auto py-12 text-center space-y-6">
        <div className="p-8 rounded-card bg-surface border border-line-strong shadow-2xs space-y-5">
          <div className="w-12 h-12 rounded-field bg-critical-bg border border-critical-border flex items-center justify-center mx-auto text-critical shadow-2xs">
            <AlertTriangle className="w-6 h-6 stroke-[2]" />
          </div>

          <div className="space-y-2">
            <h1 className="font-serif text-2xl font-normal text-fg tracking-tight">
              Operational Exception
            </h1>
            <p className="text-xs text-fg-secondary leading-relaxed max-w-sm mx-auto">
              An unexpected exception was encountered during view hydration. Gateway telemetry and persisted state remain secure.
            </p>
            {error?.digest && (
              <p className="text-caption font-mono text-fg-muted pt-1">
                Digest: {error.digest}
              </p>
            )}
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => reset()}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white font-semibold text-xs shadow-2xs transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Execution</span>
            </button>
            <Link
              href="/dashboard"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-surface-subtle hover:bg-surface-muted text-fg border border-line-strong font-semibold text-xs transition-colors"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Console</span>
            </Link>
          </div>
        </div>
      </main>

      {/* Footer Attribution */}
      <footer className="max-w-6xl w-full mx-auto py-4 text-center text-xs text-fg-muted font-mono">
        SpendGuard AI · Engineered by <a href="https://www.dattreo.com" target="_blank" rel="noopener noreferrer" className="text-fg hover:text-accent underline decoration-line-strong underline-offset-4 transition-colors">Dattreo</a>
      </footer>
    </div>
  );
}

