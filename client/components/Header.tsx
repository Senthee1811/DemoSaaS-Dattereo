'use client';

import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Bell, 
  RefreshCw, 
  Terminal, 
  LogOut
} from 'lucide-react';
import { useRouter } from 'next/navigation';

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
  const router = useRouter();
  const [userName, setUserName] = useState('Sarah Chen');
  const [userRole, setUserRole] = useState('FinOps Lead');
  const [userInitials, setUserInitials] = useState('SC');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('spendguard_user');
      if (stored) {
        try {
          const u = JSON.parse(stored);
          if (u.name) {
            setUserName(u.name);
            const parts = u.name.trim().split(' ');
            setUserInitials(parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase());
          }
          if (u.role) setUserRole(u.role === 'OWNER' ? 'Organization Owner' : u.role === 'ADMIN' ? 'FinOps Admin' : 'Member');
        } catch {}
      }
    }
  }, []);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('spendguard_token');
      localStorage.removeItem('spendguard_refresh_token');
      localStorage.removeItem('spendguard_user');
    }
    router.push('/login');
  };

  return (
    <header className="h-16 border-b border-[#E4E4E0] bg-white px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Project Selector */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2.5 bg-[#FAF8F5] border border-[#E4E4E0] rounded-full px-4 py-1.5 text-xs text-[#141413] shadow-2xs">
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
          <Terminal className="w-3.5 h-3.5" />
          <span>Test Bench</span>
        </button>

        {/* Notifications Icon */}
        <button
          type="button"
          onClick={onOpenAlerts}
          className="relative p-2 text-[#5F6368] hover:text-[#141413] hover:bg-[#F3F3F0] rounded-full border border-[#E4E4E0] transition-colors"
          title="Alerts and Guardrails"
        >
          <Bell className="w-4 h-4" />
          {unreadAlertsCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center">
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
            <p className="text-[10px] text-[#5F6368] leading-none mt-1">{userRole}</p>
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
