'use client';

import React from 'react';
import { 
  LayoutDashboard, 
  Layers, 
  KeyRound, 
  TerminalSquare, 
  FileText, 
  Bell, 
  Code2, 
  Users, 
  ShieldCheck,
  Flame
} from 'lucide-react';

export type NavTab = 
  | 'overview' 
  | 'projects' 
  | 'keys' 
  | 'playground' 
  | 'audit' 
  | 'alerts' 
  | 'sdk' 
  | 'team';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  unreadAlertsCount: number;
}

export function Sidebar({ currentTab, onSelectTab, unreadAlertsCount }: SidebarProps) {
  const navItems = [
    { id: 'overview' as NavTab, label: 'Spend Analytics', icon: LayoutDashboard },
    { id: 'projects' as NavTab, label: 'Projects & Budgets', icon: Layers },
    { id: 'keys' as NavTab, label: 'Key Vault & Gateway', icon: KeyRound },
    { id: 'playground' as NavTab, label: 'Gateway Test Bench', icon: TerminalSquare, badge: 'Live' },
    { id: 'audit' as NavTab, label: 'Audit Trail & Ledger', icon: FileText },
    { 
      id: 'alerts' as NavTab, 
      label: 'Alerts & Anomalies', 
      icon: Bell, 
      count: unreadAlertsCount > 0 ? unreadAlertsCount : undefined 
    },
    { id: 'sdk' as NavTab, label: 'Integration & SDK', icon: Code2 },
    { id: 'team' as NavTab, label: 'Team & RBAC', icon: Users },
  ];

  return (
    <aside className="w-64 bg-[#0a0f1d] border-r border-slate-800/80 flex flex-col justify-between shrink-0 select-none min-h-screen">
      <div>
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-800/60 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-bold tracking-tight text-white text-base">SpendGuard</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  AI v2.0
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">Governance & Gateway</p>
            </div>
          </div>
        </div>

        {/* Organization Badge */}
        <div className="px-4 py-3 border-b border-slate-800/40 bg-slate-900/40">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium truncate">Apex Innovations Inc.</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Enterprise
            </span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-cyan-500/15 to-indigo-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm shadow-cyan-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30">
                    {item.badge}
                  </span>
                )}

                {item.count !== undefined && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-500 text-white font-bold animate-pulse">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Governance Status Footer */}
      <div className="p-4 space-y-3">
        <a
          href="/"
          className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-xs font-semibold text-cyan-400 border border-slate-700 transition-all"
        >
          <span>🌐 View Marketing Site</span>
        </a>

        <div className="border-t border-slate-800/60 bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
          <div className="flex items-center space-x-2 text-xs text-slate-300 font-semibold mb-1">
            <Flame className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>Guardrail Status</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Fail-Closed Policy</span>
            <span className="text-emerald-400 font-semibold">Active</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
            <span>Encrypted Key Vault</span>
            <span className="text-cyan-400 font-semibold">AES-256</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
