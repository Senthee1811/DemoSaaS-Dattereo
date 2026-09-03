'use client';

import React from 'react';
import { Star, ShieldCheck } from 'lucide-react';

interface TrustBadgeProps {
  className?: string;
}

export function TrustBadge({ className = '' }: TrustBadgeProps) {
  return (
    <div
      className={`inline-flex items-center gap-3 px-3.5 py-2 bg-white/95 backdrop-blur-md rounded-2xl border border-[#E8E8E8] shadow-[0_8px_20px_rgba(0,0,0,0.06)] hover:border-[#FFD9C7] transition-all ${className}`}
    >
      <div className="flex items-center text-amber-400">
        {[...Array(5)].map((_, i) => (
          <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
        ))}
      </div>
      <div className="text-left flex flex-col">
        <span className="text-[12px] font-bold text-[#111111] leading-none">
          4.9/5 <span className="font-normal text-[#666666]">rating</span>
        </span>
        <span className="text-[10px] text-[#777777] leading-none mt-0.5">
          from 2,400+ engineering teams
        </span>
      </div>
    </div>
  );
}
