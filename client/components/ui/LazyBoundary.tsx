'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** What the user was opening, for the message ("Cost Insights"). */
  name: string;
  /** 'overlay' = a modal/tour that failed to load: a small fixed notice instead of an in-page block. */
  variant?: 'section' | 'overlay';
}
interface State {
  error: Error | null;
}

/** True when a code chunk failed to download (a flaky network, or a new deploy removed the old chunk). */
export function isChunkLoadError(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null;
  return !!e && (e.name === 'ChunkLoadError' || /Loading chunk|Failed to fetch dynamically imported|Importing a module script failed|error loading dynamically imported module/i.test(e.message ?? ''));
}

/**
 * Catches a failure while a lazily loaded workspace loads or renders, so one section failing never blanks the dashboard
 * shell. Retrying a failed download reloads the page (a rejected dynamic import stays rejected for the life of the page);
 * any other error just remounts the section. Reset by changing `key` (the dashboard keys it by the selected tab).
 */
export class LazyBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Name and message only: never log component stacks or props (they can contain financial data)
    console.error(`[${this.props.name}] failed to load:`, error.name, error.message);
  }

  retry = () => {
    if (isChunkLoadError(this.state.error)) window.location.reload();
    else this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    const chunk = isChunkLoadError(this.state.error);
    if (this.props.variant === 'overlay') {
      return (
        <div role="alert" className="fixed bottom-4 right-4 z-50 max-w-xs p-3 rounded-card border border-critical-border bg-critical-bg text-critical text-xs shadow-lg" data-testid="lazy-error">
          <p className="font-semibold">{this.props.name} could not be opened.</p>
          <button type="button" onClick={this.retry} className="mt-2 underline font-semibold">{chunk ? 'Reload the page' : 'Try again'}</button>
        </div>
      );
    }
    return (
      <div role="alert" className="p-6 rounded-card border border-critical-border bg-critical-bg text-critical" data-testid="lazy-error">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="w-4 h-4" aria-hidden /> {this.props.name} could not be loaded
        </p>
        <p className="mt-1 text-xs">
          {chunk ? 'Part of the page failed to download (your connection dropped, or a newer version was released).' : 'Something went wrong while opening this section.'} The rest of the dashboard is unaffected.
        </p>
        <button type="button" onClick={this.retry} className="mt-3 px-3 py-1.5 rounded-full border border-current text-xs font-semibold">
          {chunk ? 'Reload the page' : 'Try again'}
        </button>
      </div>
    );
  }
}
