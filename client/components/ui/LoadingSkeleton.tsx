'use client';

import React from 'react';

export function CardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`p-6 bg-surface rounded-card border border-line animate-pulse space-y-3 shadow-2xs ${className}`}>
      <div className="flex items-center justify-between">
        <div className="w-24 h-3.5 bg-surface-muted rounded-full" />
        <div className="w-6 h-6 bg-surface-muted rounded-full" />
      </div>
      <div className="w-32 h-7 bg-surface-muted rounded-menu" />
      <div className="w-40 h-3 bg-surface-muted rounded-full" />
    </div>
  );
}

export function ChartSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`p-6 bg-surface rounded-card border border-line animate-pulse space-y-4 shadow-2xs ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-1.5">
          <div className="w-28 h-4 bg-surface-muted rounded-full" />
          <div className="w-44 h-3 bg-surface-muted rounded-full" />
        </div>
        <div className="w-16 h-5 bg-surface-muted rounded-full" />
      </div>
      <div className="w-full h-56 bg-surface-subtle rounded-field flex items-end justify-between p-4 gap-2">
        {[35, 60, 25, 75, 50, 85, 65].map((h, i) => (
          <div
            key={i}
            style={{ height: `${h}%` }}
            className="flex-1 bg-surface-muted rounded-t-control"
          />
        ))}
      </div>
    </div>
  );
}

export function TableRowSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {[...Array(count)].map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between p-3.5 rounded-control bg-surface border border-line animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-control bg-surface-muted" />
            <div className="space-y-1">
              <div className="w-28 h-3.5 bg-surface-muted rounded-control" />
              <div className="w-36 h-2.5 bg-surface-muted rounded-control" />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="w-16 h-3 bg-surface-muted rounded-control" />
            <div className="w-16 h-4 bg-surface-muted rounded-control" />
            <div className="w-12 h-3.5 bg-surface-muted rounded-control" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Placeholder for a whole workspace that is loading its code. Same outer rhythm as the real workspaces (a heading block, a
 * row of cards, one table/panel) so the page does not jump when the real view replaces it. Pulse only; the global
 * prefers-reduced-motion rule in globals.css stops the animation.
 */
export function ViewSkeleton({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-live="polite" data-testid="view-skeleton">
      <span className="sr-only">{label}…</span>
      <div className="space-y-2 animate-pulse">
        <div className="w-56 h-7 bg-surface-muted rounded-menu" />
        <div className="w-96 max-w-full h-3.5 bg-surface-muted rounded-full" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <div className="p-6 bg-surface rounded-card border border-line animate-pulse shadow-2xs">
        <TableRowSkeleton count={4} />
      </div>
    </div>
  );
}

/** A chart card whose plot area is reserved at the real chart's height (h-64) so the chart appears without moving anything. */
export function ChartAreaSkeleton({ height = 'h-64' }: { height?: string }) {
  return (
    <div className={`${height} w-full rounded-field bg-surface-subtle border border-line animate-pulse flex items-end justify-between p-4 gap-2`} role="status" aria-busy="true" data-testid="chart-skeleton">
      <span className="sr-only">Loading chart…</span>
      {[35, 55, 30, 70, 50, 80, 62, 75].map((h, i) => (
        <div key={i} style={{ height: `${h}%` }} className="flex-1 bg-surface-muted rounded-t-control" />
      ))}
    </div>
  );
}

/** A modal's body while its code loads: a few lines, no layout of its own. */
export function DetailPanelSkeleton() {
  return (
    <div className="p-6 space-y-3 animate-pulse" role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="w-48 h-5 bg-surface-muted rounded-menu" />
      <div className="w-full h-3 bg-surface-muted rounded-full" />
      <div className="w-5/6 h-3 bg-surface-muted rounded-full" />
      <div className="w-2/3 h-3 bg-surface-muted rounded-full" />
    </div>
  );
}
