'use client';

import React from 'react';

export const CARD = 'p-5 bg-surface rounded-card border border-line shadow-2xs';
export const q = (projectId: string, extra = '') => `${projectId ? `projectId=${encodeURIComponent(projectId)}` : ''}${projectId && extra ? '&' : ''}${extra}`;

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: Array<{ id: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`px-3 py-1.5 rounded-full border text-label font-semibold transition-colors ${
            value === o.id ? 'bg-fg text-surface border-fg' : 'bg-surface border-line text-fg-secondary hover:text-fg'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * Says how old the figures on screen are. Financial numbers must never look more current than they are: when a panel is
 * showing a cached copy it says so (and that a refresh is running); otherwise it shows when the data was fetched.
 */
export function Freshness({ fetchedAt, isStale }: { fetchedAt: number | null; isStale: boolean }) {
  if (!fetchedAt) return null;
  return (
    <p className="text-caption text-fg-muted" role="status" aria-live="polite" data-testid="freshness" data-stale={isStale}>
      {isStale ? `Showing a saved copy from ${clock(fetchedAt)} while the latest loads…` : `Updated ${clock(fetchedAt)}`}
    </p>
  );
}
