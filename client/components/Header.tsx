'use client';

import {
  Building2,
  Bell,
  RefreshCw,
  FlaskConical,
  LogOut,
  Menu,
  CircleHelp,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { clearSession } from '@/lib/auth-fetch';
import { useStoredUser } from '@/lib/client-storage';

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
}: HeaderProps) {
  const router = useRouter();
  const user = useStoredUser();
  const userName = user?.name?.trim() || 'Signed in';
  const userRole = (user?.role && ROLE_LABELS[user.role]) || 'Member';
  const userInitials = user?.name ? initialsOf(user.name) : '?';

  const handleLogout = () => {
    clearSession();
    router.push('/login');
  };

  return (
    <header className="h-16 border-b border-[#E4E4E0] bg-white px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Project Selector & Mobile Menu Trigger */}
      <div className="flex items-center space-x-2.5 sm:space-x-3">
        {onToggleMobileMenu && (
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="p-2 text-[#5F6368] hover:text-[#141413] hover:bg-[#F3F3F0] rounded-full border border-[#E4E4E0] transition-colors lg:hidden"
            title="Toggle Navigation Menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-center space-x-2.5 bg-[#FAF8F5] border border-[#E4E4E0] rounded-full px-3 sm:px-4 py-1.5 text-xs text-[#141413] shadow-2xs">
          <Building2 className="w-3.5 h-3.5 text-[#5F6368]" />
          <span className="text-[#5F6368] font-medium">Scope:</span>
          <select
            value={selectedProjectId}
            onChange={(e) => onSelectProject(e.target.value)}
            aria-label="Scope Project Selection"
            className="bg-transparent text-[#141413] font-semibold focus:outline-none cursor-pointer pr-1 text-xs"
          >
            <option value="" className="bg-white text-[#141413]">
              All Projects (Organization)
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id} className="bg-white text-[#141413]">
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={onRefreshData}
          disabled={isRefreshing}
          className="p-2 text-[#5F6368] hover:text-[#141413] hover:bg-[#F3F3F0] rounded-full border border-[#E4E4E0] transition-colors"
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
          className="flex items-center space-x-2 px-4 py-1.5 bg-[#FF6B35] hover:bg-[#E55A25] text-white font-semibold text-xs rounded-full shadow-2xs transition-colors"
        >
          <FlaskConical className="w-3.5 h-3.5" />
          <span>Test Bench</span>
        </button>

        {/* Help Center Trigger */}
        {onOpenHelp && (
          <button
            type="button"
            onClick={onOpenHelp}
            className="p-2 text-[#5F6368] hover:text-[#141413] hover:bg-[#F3F3F0] rounded-full border border-[#E4E4E0] transition-colors"
            title="Open Help Center & Documentation"
          >
            <CircleHelp className="w-4 h-4" />
          </button>
        )}

        {/* Notifications Icon */}
        <button
          type="button"
          onClick={onOpenAlerts}
          className="relative p-2 text-[#5F6368] hover:text-[#141413] hover:bg-[#F3F3F0] rounded-full border border-[#E4E4E0] transition-colors"
          title="Alerts and Guardrails"
        >
          <Bell className="w-4 h-4" />
          {unreadAlertsCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-micro font-bold flex items-center justify-center">
              {unreadAlertsCount}
            </span>
          )}
        </button>

        {/* User Profile & Sign Out */}
        <div className="flex items-center space-x-2.5 pl-3 border-l border-[#E4E4E0]">
          <div className="w-8 h-8 rounded-full bg-[#FAF8F5] border border-[#E4E4E0] flex items-center justify-center text-xs font-semibold text-[#141413]">
            {userInitials}
          </div>
          <div className="hidden sm:block text-left text-xs">
            <p className="font-semibold text-[#141413] leading-none">{userName}</p>
            <p className="text-caption text-[#5F6368] leading-none mt-1">{userRole}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="p-1.5 text-[#80868B] hover:text-red-600 hover:bg-[#FEF2F2] rounded-full transition-colors ml-1"
            title="Sign out of SpendGuard"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
