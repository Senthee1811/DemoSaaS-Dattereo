'use client';

import React from 'react';

export function CardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`p-6 bg-white rounded-3xl border border-[#E8E8E8] animate-pulse space-y-4 shadow-sm ${className}`}>
      <div className="flex items-center justify-between">
        <div className="w-24 h-4 bg-[#F0ECE7] rounded-md" />
        <div className="w-8 h-8 bg-[#FFF1EA] rounded-xl" />
      </div>
      <div className="w-36 h-7 bg-[#E8E8E8] rounded-md" />
      <div className="w-48 h-3.5 bg-[#F0ECE7] rounded-md" />
    </div>
  );
}

export function ChartSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`p-6 bg-white rounded-3xl border border-[#E8E8E8] animate-pulse space-y-4 shadow-sm ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-1.5">
          <div className="w-32 h-4 bg-[#E8E8E8] rounded-md" />
          <div className="w-48 h-3 bg-[#F0ECE7] rounded-md" />
        </div>
        <div className="w-20 h-6 bg-[#F0ECE7] rounded-full" />
      </div>
      <div className="w-full h-64 bg-gradient-to-t from-[#FFF1EA]/60 to-[#F0ECE7]/30 rounded-2xl flex items-end justify-between p-4 gap-2">
        {[40, 65, 30, 80, 55, 90, 70].map((h, i) => (
          <div
            key={i}
            style={{ height: `${h}%` }}
            className="flex-1 bg-[#FFD4C2]/50 rounded-t-lg"
          />
        ))}
      </div>
    </div>
  );
}

export function TableRowSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2.5">
      {[...Array(count)].map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between p-4 rounded-2xl bg-[#FFF8F5]/60 border border-[#F0ECE7] animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#FFF1EA]" />
            <div className="space-y-1.5">
              <div className="w-28 h-3.5 bg-[#E8E8E8] rounded-md" />
              <div className="w-40 h-2.5 bg-[#F0ECE7] rounded-md" />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="w-16 h-3 bg-[#F0ECE7] rounded-md" />
            <div className="w-20 h-5 bg-[#FFD9C7]/50 rounded-full" />
            <div className="w-12 h-3.5 bg-[#E8E8E8] rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}
