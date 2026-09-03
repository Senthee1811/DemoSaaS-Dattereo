'use client';

import React from 'react';
import Image from 'next/image';

export interface TeamMemberProps {
  name: string;
  role: string;
  statusText: string;
  statusColor: 'green' | 'orange' | 'amber';
  avatarUrl: string;
  className?: string;
  showConnectionLine?: boolean;
}

export function TeamMemberCard({
  name,
  role,
  statusText,
  statusColor,
  avatarUrl,
  className = '',
}: TeamMemberProps) {
  const dotBg =
    statusColor === 'green'
      ? 'bg-emerald-500'
      : statusColor === 'amber'
      ? 'bg-amber-500'
      : 'bg-[#FF6B35]';

  return (
    <div
      className={`inline-flex items-center gap-2.5 px-3 py-2 bg-white/95 backdrop-blur-md rounded-2xl border border-[#E8E8E8] shadow-[0_8px_24px_rgba(0,0,0,0.06),0_2px_8px_rgba(255,107,53,0.05)] transition-all hover:scale-105 hover:border-[#FFD9C7] ${className}`}
    >
      <div className="relative w-8 h-8 rounded-full overflow-hidden border border-[#E8E8E8] flex-shrink-0 bg-[#FFF1EA]">
        {/* Fallback initials if image fails or while loading */}
        <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-[#FF6B35]">
          {name
            .split(' ')
            .map((n) => n[0])
            .join('')}
        </div>
      </div>

      <div className="flex flex-col text-left">
        <div className="flex items-center gap-1.5">
          <span className="text-[12.5px] font-bold text-[#111111] leading-none">
            {name}
          </span>
          <span className={`w-1.5 h-1.5 rounded-full ${dotBg}`} />
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10.5px] text-[#666666] leading-none">{role}</span>
          <span className="text-[9px] text-[#999999] leading-none">· {statusText}</span>
        </div>
      </div>
    </div>
  );
}
