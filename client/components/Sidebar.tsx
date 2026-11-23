'use client';

import React from 'react';
import Link from 'next/link';
import { useStoredUser } from '@/lib/client-storage';
import {
  LayoutDashboard,
  FolderKanban,
  KeyRound,
  FlaskConical,
  ScrollText,
  BellRing,
  Network,
  Users,
  ShieldCheck,
  CreditCard,
  X,
  CircleHelp,
  Compass,
  Settings2,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

export type NavTab = 
  | 'overview' 
  | 'projects' 
  | 'keys' 
  | 'playground' 
  | 'audit' 
  | 'alerts' 
  | 'sdk' 
  | 'team'
  | 'billing'
  | 'settings';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  unreadAlertsCount: number;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  onOpenHelp?: () => void;
  onStartTour?: () => void;
}

interface NavSection {
  title: string;
  items: {
    id: NavTab;
    label: string;
    icon: React.ElementType;
    badge?: string;
    count?: number;
  }[];
}

export function Sidebar({ 
  currentTab, 
  onSelectTab, 
  unreadAlertsCount, 
  isOpenMobile = false, 
  onCloseMobile,
  onOpenHelp,
  onStartTour
}: SidebarProps) {
  const orgName = useStoredUser()?.orgName || 'Your workspace';

  const sections: NavSection[] = [
    {
      title: 'WORKSPACE',
      items: [
        { id: 'overview', label: 'Overview', icon: LayoutDashboard },
        { id: 'projects', label: 'Projects & Budgets', icon: FolderKanban },
        { id: 'playground', label: 'Test Bench', icon: FlaskConical, badge: 'Live' },
      ],
    },
    {
      title: 'GOVERNANCE',
      items: [
        { id: 'keys', label: 'Key Vault & Tokens', icon: KeyRound },
        { 
          id: 'alerts', 
          label: 'Alerts & Anomalies', 
          icon: BellRing, 
          count: unreadAlertsCount > 0 ? unreadAlertsCount : undefined 
        },
        { id: 'audit', label: 'Audit Ledger', icon: ScrollText },
      ],
    },
    {
      title: 'ORGANIZATION',
      items: [
        { id: 'team', label: 'Team & Access', icon: Users },
        { id: 'billing', label: 'Billing & Plans', icon: CreditCard },
        { id: 'settings', label: 'Settings & Account', icon: Settings2 },
      ],
    },
    {
      title: 'GLOBAL',
      items: [
        { id: 'sdk', label: 'Gateway SDK & Docs', icon: Network },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div 
          onClick={onCloseMobile}
          className="fixed inset-0 bg-overlay backdrop-blur-xs z-40 lg:hidden transition-opacity"
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-surface border-r border-line flex flex-col h-screen shrink-0 select-none transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
        isOpenMobile ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
      }`}>
        {/* Brand Header */}
        <div className="h-16 px-4 border-b border-line flex items-center justify-between shrink-0">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-menu bg-accent flex items-center justify-center text-white shadow-xs">
              <ShieldCheck className="w-4 h-4 text-white" strokeWidth={2.4} />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 leading-none">
                <span className="font-serif font-medium tracking-tight text-fg text-sm">SpendGuard</span>
                <Badge mono className="uppercase tracking-wider">AI</Badge>
              </div>
              <span className="text-caption text-fg-muted font-mono mt-0.5">by Dattreo</span>
            </div>
          </Link>

          {/* Close button on mobile */}
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="p-1.5 rounded-full hover:bg-surface-muted text-fg-secondary lg:hidden"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Organization Badge */}
        <div className="px-4 py-2.5 border-b border-line bg-surface-subtle shrink-0">
          <div className="flex items-center justify-between text-xs">
            <span className="text-fg font-semibold truncate text-label">{orgName}</span>
            <Badge tone="success">Active</Badge>
          </div>
        </div>

        {/* Structured Navigation Groups */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-4">
          {sections.map((section) => (
            <div key={section.title} className="space-y-1">
              <span className="px-3 text-caption font-mono font-semibold uppercase tracking-wider text-fg-muted block">
                {section.title}
              </span>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelectTab(item.id);
                        onCloseMobile?.();
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 rounded-full text-xs transition-colors ${
                        isActive
                          ? 'bg-accent-subtle text-accent font-semibold border border-accent-border shadow-2xs'
                          : 'text-fg-secondary hover:text-fg hover:bg-surface-muted border border-transparent font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-accent' : 'text-fg-muted'}`} strokeWidth={1.8} />
                        <span className="truncate">{item.label}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {item.badge && (
                          <span className="text-micro px-2 py-0.2 rounded-full bg-accent text-white font-mono font-bold uppercase tracking-wider">
                            {item.badge}
                          </span>
                        )}

                        {item.count !== undefined && (
                          <span className="text-caption px-2 py-0.2 rounded-full bg-red-600 text-white font-bold">
                            {item.count}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Quick Help & Tour triggers in sidebar */}
          <div className="pt-2 border-t border-line/60 space-y-1">
            <span className="px-3 text-caption font-mono font-semibold uppercase tracking-wider text-fg-muted block">
              SUPPORT & TOURS
            </span>
            <button
              type="button"
              onClick={() => {
                onOpenHelp?.();
                onCloseMobile?.();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-full text-xs text-fg-secondary hover:text-fg hover:bg-surface-muted font-medium transition-colors"
            >
              <CircleHelp className="w-4 h-4 text-fg-muted shrink-0" />
              <span>Help Center & FAQ</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onStartTour?.();
                onCloseMobile?.();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-full text-xs text-fg-secondary hover:text-fg hover:bg-surface-muted font-medium transition-colors"
            >
              <Compass className="w-4 h-4 text-accent shrink-0" />
              <span>Restart Product Tour</span>
            </button>
          </div>
        </nav>

      </aside>
    </>
  );
}
