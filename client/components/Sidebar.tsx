'use client';

import React from 'react';
import Link from 'next/link';
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
  ShieldAlert,
  Flame,
  Globe,
  Lock,
  ChevronRight
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
    <aside className="w-64 bg-white border-r border-[#E8E8E8] flex flex-col justify-between shrink-0 select-none min-h-screen">
      <div>
        {/* Brand Header */}
        <div className="p-5 border-b border-[#E8E8E8] flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#FF6B35] to-[#FF8A4C] flex items-center justify-center text-white shadow-md shadow-[#FF6B35]/25 transition-transform group-hover:scale-105">
              <ShieldCheck className="w-5 h-5 text-white" strokeWidth={2.4} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold tracking-tight text-[#111111] text-base">SpendGuard</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-[#FFF1EA] text-[#FF6B35] border border-[#FFD9C7]">
                  AI
                </span>
              </div>
              <p className="text-[11px] text-[#777777] font-medium">Governance & Gateway</p>
            </div>
          </Link>
        </div>

        {/* Organization Badge */}
        <div className="px-4 py-3 border-b border-[#E8E8E8] bg-[#FFF8F5]">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#444444] font-semibold truncate">Apex Innovations Inc.</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ECFDF5] text-emerald-700 border border-emerald-200">
              Enterprise
            </span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-[#FFF1EA] text-[#FF6B35] border border-[#FFD9C7] shadow-sm'
                    : 'text-[#555555] hover:text-[#111111] hover:bg-[#FFF8F5] border border-transparent'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#FF6B35]' : 'text-[#777777]'}`} />
                  <span>{item.label}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {item.badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#FF6B35] text-white font-bold">
                      {item.badge}
                    </span>
                  )}

                  {item.count !== undefined && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500 text-white font-bold">
                      {item.count}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Governance Status Footer (clean portal without overlap) */}
      <div className="p-4 space-y-3 border-t border-[#E8E8E8] bg-[#FFF8F5]/60">
        <Link
          href="/"
          className="w-full flex items-center justify-center gap-2 py-2.5 px-3.5 rounded-xl bg-white hover:bg-[#FFF1EA] text-xs font-bold text-[#FF6B35] border border-[#E8E8E8] hover:border-[#FFD9C7] shadow-sm transition-all"
        >
          <Globe className="w-3.5 h-3.5" />
          <span>View Marketing Site</span>
        </Link>

        <div className="bg-white p-3 rounded-2xl border border-[#E8E8E8] shadow-sm space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-[#111111]">
            <div className="flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-[#FF6B35]" />
              <span>Guardrails</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#ECFDF5] text-emerald-700 font-bold border border-emerald-200">
              Active
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px] text-[#666666]">
            <span>Fail-Closed Enforced</span>
            <span className="font-semibold text-[#111111]">Sub-5ms</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-[#666666]">
            <span>Key Vault</span>
            <span className="font-semibold text-[#FF6B35]">AES-256</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
