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
    <header className="h-16 border-b border-slate-800/80 bg-[#090e1a]/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Project Selector */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2 bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300">
          <Building2 className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-400 font-medium">Scope:</span>
          <select
            value={selectedProjectId}
            onChange={(e) => onSelectProject(e.target.value)}
            className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer pr-1"
          >
            <option value="" className="bg-slate-900 text-slate-200">
              🌐 All Projects (Enterprise)
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id} className="bg-slate-900 text-slate-200">
                📁 {p.name}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={onRefreshData}
          disabled={isRefreshing}
          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-lg border border-transparent hover:border-slate-700/60 transition-all"
          title="Refresh metrics"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
        </button>
      </div>

      {/* Right Controls */}
      <div className="flex items-center space-x-3">
        {/* Quick Test Bench CTA */}
        <button
          onClick={onOpenPlayground}
          className="flex items-center space-x-2 px-3.5 py-1.5 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-semibold text-xs rounded-lg shadow-sm shadow-cyan-500/20 transition-all"
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Gateway Playground</span>
        </button>

        {/* Notifications Icon */}
        <button
          onClick={onOpenAlerts}
          className="relative p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-lg border border-slate-800/60 transition-all"
          title="Alerts and Guardrails"
        >
          <Bell className="w-4 h-4" />
          {unreadAlertsCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
              {unreadAlertsCount}
            </span>
          )}
        </button>

        {/* User Avatar */}
        <div className="flex items-center space-x-2 pl-2 border-l border-slate-800">
          <img
            src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80"
            alt="Sarah Chen"
            className="w-7 h-7 rounded-full border border-cyan-500/40 object-cover"
          />
          <div className="hidden sm:block text-left text-xs">
            <p className="font-semibold text-white leading-none">Sarah Chen</p>
            <p className="text-[10px] text-cyan-400 font-medium leading-tight">Org Owner</p>
          </div>
        </div>
      </div>
    </header>
  );
}
