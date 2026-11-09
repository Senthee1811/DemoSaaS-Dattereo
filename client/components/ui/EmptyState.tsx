'use client';

import React from 'react';
import { LucideIcon, Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionText,
  onAction,
  className = '',
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={`w-full flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-[#E4E4E0] bg-white ${
        compact ? 'p-6' : 'p-10 sm:p-12'
      } ${className}`}
    >
      <div className="w-10 h-10 rounded-lg bg-[#F3F3F0] border border-[#E4E4E0] text-[#5F6368] flex items-center justify-center mb-3">
        <Icon className="w-5 h-5" strokeWidth={1.75} />
      </div>

      <h4 className="text-sm font-semibold text-[#18191B] mb-1">
        {title}
      </h4>

      <p className="text-xs text-[#5F6368] max-w-md leading-relaxed mb-4">
        {description}
      </p>

      {actionText && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-[#FF6B35] hover:bg-[#E85520] shadow-xs transition-colors"
        >
          {actionText}
        </button>
      )}
    </div>
  );
}
