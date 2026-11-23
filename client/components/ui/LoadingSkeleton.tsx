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
            className="flex-1 bg-surface-muted rounded-t"
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
