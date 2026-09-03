'use client';

import React from 'react';
import { Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface BudgetAlertCardProps {
  className?: string;
}

export function BudgetAlertCard({ className = '' }: BudgetAlertCardProps) {
  return (
    <div
      className={`w-full max-w-[340px] bg-white rounded-2xl border border-[#FFE0D2] p-4 shadow-[0_16px_36px_rgba(255,107,53,0.12),0_4px_12px_rgba(0,0,0,0.04)] animate-float-slow transition-all hover:border-[#FF6B35] ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#FFF0EA]">
        <div className="flex items-center gap-1.5 text-[#FF6B35]">
          <div className="w-5 h-5 rounded-md bg-[#FFF1EA] flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-[#FF6B35]" />
          </div>
          <span className="text-[11px] font-extrabold tracking-wider uppercase">
            Budget Alert
          </span>
        </div>
        <span className="text-[10px] font-medium text-[#999999]">Just now</span>
      </div>

      {/* Body */}
      <div className="py-2.5">
        <p className="text-[12.5px] font-medium text-[#111111] leading-snug">
          <span className="font-semibold text-[#FF6B35]">Marketing Project</span> has used{' '}
          <span className="font-bold text-[#111111]">82%</span> of its monthly budget ($4,100 / $5,000).
        </p>

        {/* Progress bar visual */}
        <div className="w-full h-1.5 bg-[#FFF1EA] rounded-full mt-2 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#FF8A4C] to-[#FF6B35] rounded-full w-[82%]" />
        </div>
      </div>

      {/* Footer Row */}
      <div className="pt-2 border-t border-[#FFF0EA] flex items-center justify-between text-[10.5px]">
        <span className="text-[#777777] font-medium">Confidence: 99.4%</span>
        <span className="text-[#FF6B35] font-semibold flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          <span>Auto-synced</span>
        </span>
      </div>
    </div>
  );
}
