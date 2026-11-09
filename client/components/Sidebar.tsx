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
  CreditCard,
  ExternalLink,
  Cpu
} from 'lucide-react';

export type NavTab = 
  | 'overview' 
  | 'projects' 
  | 'keys' 
  | 'playground' 
  | 'audit' 
  | 'alerts' 
  | 'sdk' 
  | 'team'
  | 'billing';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  unreadAlertsCount: number;
}

export function Sidebar({ currentTab, onSelectTab, unreadAlertsCount }: SidebarProps) {
  const [orgName, setOrgName] = React.useState('Apex Innovations');

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('spendguard_user');
      if (stored) {
        try {
          const u = JSON.parse(stored);
          if (u.orgName) setOrgName(u.orgName);
        } catch {}
      }
    }
  }, []);

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
    { id: 'billing' as NavTab, label: 'Plans & Billing', icon: CreditCard },
  ];

  return (
    <aside className="w-60 bg-white border-r border-[#E4E4E0] flex flex-col h-screen shrink-0 select-none">
      {/* Brand Header */}
      <div className="h-16 px-4 border-b border-[#E4E4E0] flex items-center justify-between shrink-0">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#FF6B35] flex items-center justify-center text-white shadow-xs">
            <ShieldCheck className="w-4 h-4 text-white" strokeWidth={2.4} />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 leading-none">
              <span className="font-serif font-medium tracking-tight text-[#141413] text-sm">SpendGuard</span>
              <span className="text-[9px] uppercase font-mono font-bold tracking-wider px-1 py-0.2 rounded-full bg-[#F3F3F0] text-[#5F6368] border border-[#E4E4E0]">
                AI
              </span>
            </div>
            <span className="text-[10px] text-[#80868B] font-mono mt-0.5">by Dattreo</span>
          </div>
        </Link>
      </div>

      {/* Organization Badge */}
      <div className="px-4 py-3 border-b border-[#E4E4E0] bg-[#FBFBFA] shrink-0">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#141413] font-semibold truncate text-[11px]">{orgName}</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#F0FDF4] text-[#0D9488] border border-[#BBF7D0]">
            Active
          </span>
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-full text-xs transition-colors ${
                isActive
                  ? 'bg-[#FFF7F2] text-[#FF6B35] font-semibold border border-[#FFD2C0] shadow-2xs'
                  : 'text-[#5F6368] hover:text-[#141413] hover:bg-[#F3F3F0] border border-transparent font-medium'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#FF6B35]' : 'text-[#80868B]'}`} strokeWidth={1.8} />
                <span>{item.label}</span>
              </div>

              <div className="flex items-center gap-1.5">
                {item.badge && (
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#FF6B35] text-white font-mono font-bold uppercase tracking-wider">
                    {item.badge}
                  </span>
                )}

                {item.count !== undefined && (
                  <span className="text-[10px] px-2 py-0.2 rounded-full bg-red-600 text-white font-bold">
                    {item.count}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </nav>

      {/* Operational Health Footer */}
      <div className="p-3.5 border-t border-[#E4E4E0] bg-[#FBFBFA] space-y-2.5 shrink-0">
        <div className="p-3 rounded-2xl bg-white border border-[#E4E4E0] space-y-1.5 text-[11px] shadow-2xs">
          <div className="flex items-center justify-between font-semibold text-[#141413]">
            <div className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-[#FF6B35]" />
              <span>Budget Engine</span>
            </div>
            <span className="text-[10px] text-[#0D9488] font-bold font-mono">Sub-5ms</span>
          </div>
          <div className="flex items-center justify-between text-[#5F6368] text-[10px]">
            <span>Fail-Closed</span>
            <span className="font-semibold text-[#141413]">Enforced</span>
          </div>
          <div className="flex items-center justify-between text-[#5F6368] text-[10px]">
            <span>Key Vault</span>
            <span className="font-semibold text-[#141413] font-mono">AES-256-GCM</span>
          </div>
        </div>

        <Link
          href="/"
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-full bg-white hover:bg-[#F3F3F0] text-[11px] font-medium text-[#5F6368] hover:text-[#141413] border border-[#E4E4E0] transition-colors shadow-2xs"
        >
          <span>Marketing Site</span>
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
    </aside>
  );
}
