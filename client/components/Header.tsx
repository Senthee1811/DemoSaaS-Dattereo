'use client';

import React from 'react';
import { 
  Building2, 
  Bell, 
  RefreshCw, 
  Terminal, 
  ShieldAlert,
  ChevronDown
} from 'lucide-react';

interface HeaderProps {
  projects: Array<{ id: string; name: string }>;
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
  onOpenPlayground: () => void;
  onOpenAlerts: () => void;
  onRefreshData: () => void;
  isRefreshing: boolean;
  unreadAlertsCount: number;
}

export function Header({
  projects,
  selectedProjectId,
  onSelectProject,
  onOpenPlayground,
  onOpenAlerts,
  onRefreshData,
  isRefreshing,
  unreadAlertsCount,
}: HeaderProps) {
  return (
    <header className="h-16 border-b border-[#E8E8E8] bg-white/90 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Project Selector */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2 bg-[#FFF8F5] border border-[#E8E8E8] rounded-2xl px-3.5 py-1.5 text-xs text-[#111111]">
          <Building2 className="w-3.5 h-3.5 text-[#FF6B35]" />
          <span className="text-[#777777] font-medium">Scope:</span>
          <select
            value={selectedProjectId}
            onChange={(e) => onSelectProject(e.target.value)}
            aria-label="Scope Project Selection"
            className="bg-transparent text-[#111111] font-bold focus:outline-none cursor-pointer pr-1 text-xs"
          >
            <option value="" className="bg-white text-[#111111]">
              🌐 All Projects (Enterprise)
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id} className="bg-white text-[#111111]">
                📁 {p.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={onRefreshData}
          disabled={isRefreshing}
          className="p-2 text-[#666666] hover:text-[#111111] hover:bg-[#FFF8F5] rounded-xl border border-transparent hover:border-[#E8E8E8] transition-all"
          title="Refresh metrics"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#FF6B35]' : ''}`} />
        </button>
      </div>

      {/* Right Controls */}
      <div className="flex items-center space-x-3">
        {/* Quick Test Bench CTA */}
        <button
          type="button"
          onClick={onOpenPlayground}
          className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] hover:from-[#F55D25] hover:to-[#FF7B38] text-white font-bold text-xs rounded-xl shadow-sm shadow-[#FF6B35]/30 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Gateway Playground</span>
        </button>

        {/* Notifications Icon */}
        <button
          type="button"
          onClick={onOpenAlerts}
          className="relative p-2 text-[#666666] hover:text-[#111111] hover:bg-[#FFF8F5] rounded-xl border border-[#E8E8E8] transition-all"
          title="Alerts and Guardrails"
        >
          <Bell className="w-4 h-4" />
          {unreadAlertsCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
              {unreadAlertsCount}
            </span>
          )}
        </button>

        {/* User Profile */}
        <div className="flex items-center space-x-2.5 pl-2 border-l border-[#E8E8E8]">
          <div className="w-8 h-8 rounded-full bg-[#FFF1EA] border border-[#FFD9C7] flex items-center justify-center text-xs font-bold text-[#FF6B35]">
            SC
          </div>
          <div className="hidden sm:block text-left text-xs">
            <p className="font-bold text-[#111111] leading-none">Sarah Chen</p>
            <p className="text-[10px] text-[#777777] leading-none mt-0.5">FinOps Lead</p>
          </div>
        </div>
      </div>
    </header>
  );
}
