'use client';

import {
  Building2,
  Bell,
  RefreshCw,
  FlaskConical,
  Menu,
  CircleHelp,
} from 'lucide-react';
import { useStoredUser } from '@/lib/client-storage';
import { AccountMenu } from './AccountMenu';
import type { SettingsTab } from '@/components/settings/SettingsView';

interface HeaderProps {
  projects: Array<{ id: string; name: string }>;
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
  onOpenPlayground: () => void;
  onOpenAlerts: () => void;
  onRefreshData: () => void;
  isRefreshing: boolean;
  unreadAlertsCount: number;
  onToggleMobileMenu?: () => void;
  onOpenHelp?: () => void;
  onOpenSettings: (section: SettingsTab) => void;
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Organization Owner',
  ADMIN: 'FinOps Admin',
  MEMBER: 'Member',
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
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
  onToggleMobileMenu,
  onOpenHelp,
  onOpenSettings,
}: HeaderProps) {
  const user = useStoredUser();
  const userName = user?.name?.trim() || 'Signed in';
  const userRole = (user?.role && ROLE_LABELS[user.role]) || 'Member';
  const userInitials = user?.name ? initialsOf(user.name) : '?';

  return (
    <header className="h-16 border-b border-line bg-surface px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Project Selector & Mobile Menu Trigger */}
      <div className="flex items-center space-x-2.5 sm:space-x-3">
        {onToggleMobileMenu && (
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="p-2 text-fg-secondary hover:text-fg hover:bg-surface-muted rounded-full border border-line transition-colors lg:hidden"
            title="Toggle Navigation Menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-center space-x-2.5 bg-surface-subtle border border-line rounded-full px-3 sm:px-4 py-1.5 text-xs text-fg shadow-2xs">
          <Building2 className="w-3.5 h-3.5 text-fg-secondary" />
          <span className="text-fg-secondary font-medium">Scope:</span>
          <select
            value={selectedProjectId}
            onChange={(e) => onSelectProject(e.target.value)}
            aria-label="Scope Project Selection"
            className="bg-transparent text-fg font-semibold focus:outline-none cursor-pointer pr-1 text-xs"
          >
            <option value="" className="bg-surface text-fg">
              All Projects (Organization)
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id} className="bg-surface text-fg">
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={onRefreshData}
          disabled={isRefreshing}
          className="p-2 text-fg-secondary hover:text-fg hover:bg-surface-muted rounded-full border border-line transition-colors"
          title="Refresh metrics"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-accent' : ''}`} />
        </button>
      </div>

      {/* Right Controls */}
      <div className="flex items-center space-x-3">
        {/* Quick Test Bench CTA */}
        <button
          type="button"
          onClick={onOpenPlayground}
          className="flex items-center space-x-2 px-4 py-1.5 bg-accent hover:bg-accent-hover text-white font-semibold text-xs rounded-full shadow-2xs transition-colors"
        >
          <FlaskConical className="w-3.5 h-3.5" />
          <span>Test Bench</span>
        </button>

        {/* Help Center Trigger */}
        {onOpenHelp && (
          <button
            type="button"
            onClick={onOpenHelp}
            className="p-2 text-fg-secondary hover:text-fg hover:bg-surface-muted rounded-full border border-line transition-colors"
            title="Open Help Center & Documentation"
          >
            <CircleHelp className="w-4 h-4" />
          </button>
        )}

        {/* Notifications Icon */}
        <button
          type="button"
          onClick={onOpenAlerts}
          className="relative p-2 text-fg-secondary hover:text-fg hover:bg-surface-muted rounded-full border border-line transition-colors"
          title="Alerts and Guardrails"
        >
          <Bell className="w-4 h-4" />
          {unreadAlertsCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-micro font-bold flex items-center justify-center">
              {unreadAlertsCount}
            </span>
          )}
        </button>

        {/* Account menu: profile, settings, security, theme, sign out */}
        <AccountMenu
          name={userName}
          roleLabel={userRole}
          initials={userInitials}
          email={user?.email}
          onOpenSettings={onOpenSettings}
        />
      </div>
    </header>
  );
}
