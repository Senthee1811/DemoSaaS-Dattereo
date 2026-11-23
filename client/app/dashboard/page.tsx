'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar, NavTab } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { OverviewView } from '@/components/dashboard/OverviewView';
import { ProjectsView } from '@/components/projects/ProjectsView';
import { KeyVaultView } from '@/components/keys/KeyVaultView';
import { PlaygroundView } from '@/components/playground/PlaygroundView';
import { AuditView } from '@/components/audit/AuditView';
import { AlertsView } from '@/components/alerts/AlertsView';
import { SdkView } from '@/components/sdk/SdkView';
import { TeamView } from '@/components/team/TeamView';
import { BillingView } from '@/components/billing/BillingView';
import { SettingsView, type SettingsTab } from '@/components/settings/SettingsView';
import { destinationAfterTour, ONBOARDING_STATE_KEY } from '@/lib/onboarding';
import { WelcomeModal } from '@/components/onboarding/WelcomeModal';
import { ProductTour } from '@/components/tour/ProductTour';
import { HelpCenterModal } from '@/components/help/HelpCenterModal';
import { authFetch, readApiError } from '@/lib/auth-fetch';
import { useHydrated, useLocalStorageValue, useSessionStorageValue, useStoredUser } from '@/lib/client-storage';
import type { DashboardAnalytics } from '@/lib/types';
import type { ProjectItem } from '@/components/projects/ProjectsView';

/** GET a JSON endpoint with the session token; rejects on non-2xx. */
async function getJson<T>(url: string): Promise<T> {
  const res = await authFetch(url);
  if (!res.ok) throw new Error(await readApiError(res, `${url} returned ${res.status}`));
  return (await res.json()) as T;
}

export default function AppDashboard() {
  const router = useRouter();
  const [currentTab, setCurrentTab] = useState<NavTab>('overview');
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsTab>('account');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [analyticsData, setAnalyticsData] = useState<DashboardAnalytics | null>(null);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Modal & Tour States
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const [isTourActive, setIsTourActive] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Key tracking for activation checklist
  const [hasProviderKeys, setHasProviderKeys] = useState(false);
  const [hasGatewayKeys, setHasGatewayKeys] = useState(false);

  // Session-derived values are read from storage during render (no effect + setState)
  const hydrated = useHydrated();
  const accessToken = useLocalStorageValue('spendguard_token');
  const storedUser = useStoredUser();
  const userName = storedUser?.name?.split(' ')[0] || 'there';
  const orgName = storedUser?.orgName || 'your workspace';

  // Show the welcome modal right after sign-up, or until the first tour is done
  const justRegistered = useSessionStorageValue('spendguard_just_registered') === 'true';
  const tourCompleted = useLocalStorageValue('spendguard_tour_completed');
  const onboardingState = useLocalStorageValue(ONBOARDING_STATE_KEY);
  const isWelcomeOpen =
    !welcomeDismissed && (justRegistered || (onboardingState === 'ACCOUNT_READY' && !tourCompleted));

  const dismissWelcome = () => {
    setWelcomeDismissed(true);
    try {
      sessionStorage.removeItem('spendguard_just_registered');
    } catch {
      /* storage unavailable */
    }
  };

  // Unauthenticated visitors go to login
  useEffect(() => {
    if (hydrated && !accessToken) router.push('/login');
  }, [hydrated, accessToken, router]);

  // Data loaders. State is set in .then() callbacks (after the response
  // arrives), never synchronously, so they are safe to call from effects.
  const fetchProjects = useCallback(
    () =>
      getJson<{ projects?: ProjectItem[] }>('/api/v1/projects')
        .then((data) => {
          setProjects(data.projects || []);
          setProjectsLoaded(true);
        })
        .catch((err) => console.error('Failed to fetch projects:', err)),
    [],
  );

  // Keys state for the activation checklist
  const fetchKeys = useCallback(
    () =>
      getJson<{ providerKeys?: unknown[]; gatewayKeys?: unknown[] }>('/api/v1/keys')
        .then((data) => {
          setHasProviderKeys(Boolean(data.providerKeys?.length));
          setHasGatewayKeys(Boolean(data.gatewayKeys?.length));
        })
        .catch((err) => console.error('Failed to fetch keys:', err)),
    [],
  );

  const fetchAnalytics = useCallback(
    () =>
      getJson<DashboardAnalytics>(
        selectedProjectId ? `/api/v1/analytics?projectId=${encodeURIComponent(selectedProjectId)}` : '/api/v1/analytics',
      )
        .then(setAnalyticsData)
        .catch((err) => console.error('Failed to fetch analytics:', err)),
    [selectedProjectId],
  );

  const fetchUnreadAlerts = useCallback(
    () =>
      getJson<{ alerts?: Array<{ isRead: boolean }> }>('/api/v1/alerts')
        .then((data) => setUnreadAlertsCount((data.alerts || []).filter((a) => !a.isRead).length))
        .catch((err) => console.error('Failed to fetch alert counts:', err)),
    [],
  );

  const loadAll = useCallback(
    () => Promise.all([fetchProjects(), fetchKeys(), fetchAnalytics(), fetchUnreadAlerts()]),
    [fetchProjects, fetchKeys, fetchAnalytics, fetchUnreadAlerts],
  );

  // Manual refresh (button / after mutations) shows the spinner
  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    await loadAll();
    setIsRefreshing(false);
  }, [loadAll]);

  useEffect(() => {
    if (!accessToken) return;
    loadAll();
    const interval = setInterval(() => {
      fetchAnalytics();
      fetchUnreadAlerts();
    }, 12000);
    return () => clearInterval(interval);
  }, [accessToken, loadAll, fetchAnalytics, fetchUnreadAlerts]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-subtle text-sg-text-primary">
      {/* Navigation Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        unreadAlertsCount={unreadAlertsCount}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        onOpenHelp={() => setIsHelpOpen(true)}
        onStartTour={() => setIsTourActive(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Global Application Header */}
        <Header
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={setSelectedProjectId}
          onOpenPlayground={() => setCurrentTab('playground')}
          onOpenAlerts={() => setCurrentTab('alerts')}
          onRefreshData={refreshAll}
          isRefreshing={isRefreshing}
          unreadAlertsCount={unreadAlertsCount}
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          onOpenHelp={() => setIsHelpOpen(true)}
          onOpenSettings={(section) => {
            setSettingsSection(section);
            setCurrentTab('settings');
          }}
        />

        {/* Dynamic Viewport Container */}
        <main className="flex-1 overflow-y-auto px-6 py-6 bg-surface-subtle scroll-smooth">
          <div className="max-w-7xl mx-auto">
            {currentTab === 'overview' && (
              <OverviewView
                analyticsData={analyticsData}
                projectsCount={projects.length}
                hasProviderKeys={hasProviderKeys}
                hasGatewayKeys={hasGatewayKeys}
                onNavigateToProjects={() => setCurrentTab('projects')}
                onNavigateToPlayground={() => setCurrentTab('playground')}
                onNavigateToAudit={() => setCurrentTab('audit')}
                onNavigateToKeys={() => setCurrentTab('keys')}
              />
            )}

            {currentTab === 'projects' && (
              <ProjectsView
                projects={projects}
                onRefresh={refreshAll}
              />
            )}

            {currentTab === 'keys' && (
              <KeyVaultView
                projects={projects}
                selectedProjectId={selectedProjectId}
              />
            )}

            {currentTab === 'playground' && (
              <PlaygroundView
                projects={projects}
                onRefreshMetrics={refreshAll}
              />
            )}

            {currentTab === 'audit' && (
              <AuditView
                projects={projects}
                selectedProjectId={selectedProjectId}
              />
            )}

            {currentTab === 'alerts' && (
              <AlertsView
                projects={projects}
                onRefreshUnreadCount={fetchUnreadAlerts}
              />
            )}

            {currentTab === 'sdk' && (
              <SdkView
                projects={projects}
              />
            )}

            {currentTab === 'team' && (
              <TeamView />
            )}

            {currentTab === 'billing' && (
              <BillingView />
            )}

            {currentTab === 'settings' && (
              <SettingsView
                key={settingsSection}
                initialTab={settingsSection}
                onStartTour={() => setIsTourActive(true)}
                onNavigateToTeam={() => setCurrentTab('team')}
              />
            )}
          </div>
        </main>
      </div>

      {/* Post-Signup Welcome Modal */}
      <WelcomeModal
        isOpen={isWelcomeOpen}
        onClose={dismissWelcome}
        onStartOnboarding={() => router.push('/onboarding')}
        onStartTour={() => {
          dismissWelcome();
          setIsTourActive(true);
        }}
        userName={userName}
        orgName={orgName}
      />

      {/* Interactive 9-Step Product Tour */}
      <ProductTour
        isActive={isTourActive}
        onClose={() => setIsTourActive(false)}
        onNavigateTab={(tab) => setCurrentTab(tab)}
        onFinished={() => {
          // Same completion check as the setup wizard: a set-up org stays on the console
          if (destinationAfterTour({ onboardingState, projectCount: projects.length, projectsLoaded }) === 'onboarding') {
            router.push('/onboarding');
          }
        }}
      />

      {/* In-Product Knowledge Base & Help Center */}
      <HelpCenterModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        onRestartTour={() => setIsTourActive(true)}
        onNavigateToSdk={() => setCurrentTab('sdk')}
      />
    </div>
  );
}
