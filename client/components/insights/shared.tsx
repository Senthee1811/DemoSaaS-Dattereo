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
