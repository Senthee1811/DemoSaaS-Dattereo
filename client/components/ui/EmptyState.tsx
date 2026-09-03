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
      className={`w-full flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-[#E8E8E8] bg-[#FFF8F5]/50 ${
        compact ? 'p-6' : 'p-10 sm:p-14'
      } ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-[#FFF1EA] border border-[#FFD9C7] text-[#FF6B35] flex items-center justify-center mb-3.5 shadow-sm">
        <Icon className="w-6 h-6" />
      </div>

      <h4 className="text-base font-bold text-[#111111] mb-1">
        {title}
      </h4>

      <p className="text-xs sm:text-sm text-[#666666] max-w-sm leading-relaxed mb-4">
        {description}
      </p>

      {actionText && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] shadow-sm shadow-[#FF6B35]/25 hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          {actionText}
        </button>
      )}
    </div>
  );
}
