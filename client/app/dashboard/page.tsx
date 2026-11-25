'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar, NavTab } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { OverviewView } from '@/components/dashboard/OverviewView';
import type { SettingsTab } from '@/components/settings/SettingsView';
import {
  AlertsView, AuditView, BillingView, HelpCenterModal, InsightsView, KeyVaultView, PlaygroundView, ProductTour, ProjectsView, SdkView, SettingsView, TeamView, WelcomeModal,
  prefetchWorkspacesWhenIdle, readyOrTimeout, viewState,
} from '@/components/dashboard/lazy-views';
import { LazyBoundary } from '@/components/ui/LazyBoundary';
import { destinationAfterTour, ONBOARDING_STATE_KEY } from '@/lib/onboarding';
import { ScopeProvider, resolveScopeProject } from '@/lib/scope';
import { authFetch, readApiError } from '@/lib/auth-fetch';
import { createLatest } from '@/lib/latest';
import { useErrorDialog, useToast } from '@/components/ui/feedback';
import { useHydrated, useLocalStorageValue, useSessionStorageValue, useStoredUser } from '@/lib/client-storage';
import type { DashboardAnalytics } from '@/lib/types';
import type { ProjectItem } from '@/components/projects/ProjectsView';
import { PageTransition } from '@/components/ui/motion';

/** GET a JSON endpoint with the session token; rejects on non-2xx. */
async function getJson<T>(url: string): Promise<T> {
  const res = await authFetch(url);
  if (!res.ok) throw new Error(await readApiError(res, `${url} returned ${res.status}`));
  return (await res.json()) as T;
}

const SCOPE_STORAGE_KEY = 'spendguard_scope';

/** True from the first time `flag` is true onward. Lets an overlay's code load when first opened, then stay mounted so its exit animation still plays. */
function useEverTrue(flag: boolean): boolean {
  const [seen, setSeen] = useState(flag);
  if (flag && !seen) setSeen(true);
  return seen || flag;
}

const TAB_NAME: Record<NavTab, string> = {
  overview: 'Overview', insights: 'Cost Insights', projects: 'Projects', keys: 'The key vault', playground: 'The test bench', audit: 'The audit ledger',
  alerts: 'Alerts', sdk: 'The SDK guide', team: 'Team', billing: 'Billing', settings: 'Settings',
};

function readStoredScope(): string {
  try {
    return typeof window === 'undefined' ? '' : (window.sessionStorage.getItem(SCOPE_STORAGE_KEY) ?? '');
  } catch {
    return '';
  }
}

export default function AppDashboard() {
  const router = useRouter();
  const [currentTab, setCurrentTab] = useState<NavTab>('overview');
  // Tab changes go through `navigate`: it waits (briefly) for a lazy workspace's code BEFORE switching, so the common case never
  // suspends (no skeleton flash, no React fallback throttle). A slow download switches after NAVIGATE_WAIT_MS and shows the skeleton.
  const [pendingTab, setPendingTab] = useState<NavTab | null>(null);
  const latestNav = useRef(createLatest());
  const navigate = useCallback((tab: NavTab) => {
    const isCurrent = latestNav.current.begin(); // a newer click supersedes an older one that is still waiting
    if (viewState(tab) === 'ready') {
      setPendingTab(null);
      setCurrentTab(tab);
      return;
    }
    setPendingTab(tab);
    void readyOrTimeout(tab).then(() => {
      if (!isCurrent()) return;
      setPendingTab(null);
      setCurrentTab(tab);
    });
  }, []);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const toast = useToast();
  const showError = useErrorDialog();
  const [settingsSection, setSettingsSection] = useState<SettingsTab>('account');
  // The ONE raw scope value. Everything else reads it through <ScopeProvider> (lib/scope.tsx).
  // Kept in sessionStorage so it survives leaving the dashboard (e.g. a chart's detailed-usage
  // page) and coming back. It is validated against the project list, so a stale id is harmless.
  const [rawScopeId, setRawScopeId] = useState<string>(readStoredScope);
  const setScopeId = useCallback((id: string) => {
    setRawScopeId(id);
    try {
      if (id) sessionStorage.setItem(SCOPE_STORAGE_KEY, id);
      else sessionStorage.removeItem(SCOPE_STORAGE_KEY);
    } catch {
      /* storage unavailable: scope still works for this visit */
    }
  }, []);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const selectedProjectId = projects.some((p) => p.id === rawScopeId) ? rawScopeId : '';
  // Analytics are stored WITH the scope they were fetched for. Figures for another scope are never shown under this scope's name:
  // while a switch is loading the Overview shows its skeleton, not the previous project's numbers.
  const [analytics, setAnalytics] = useState<{ scope: string; data: DashboardAnalytics } | null>(null);
  const latestAnalytics = useRef(createLatest());
  const analyticsData = analytics && analytics.scope === selectedProjectId ? analytics.data : null;
  const [unreadAlertsCount, setUnreadAlertsCount] = useState<number>(0);
  const [inboxUnread, setInboxUnread] = useState<number>(0);
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
  // Overlays are separate chunks: their code is requested the first time they are needed
  const welcomeMounted = useEverTrue(isWelcomeOpen);
  const tourMounted = useEverTrue(isTourActive);
  const helpMounted = useEverTrue(isHelpOpen);

  const dismissWelcome = () => {
    setWelcomeDismissed(true);
    try {
      sessionStorage.removeItem('spendguard_just_registered');
    } catch {
      /* storage unavailable */
    }
  };

  // Tour: send a real test alert through POST /api/v1/alerts (the same path as Settings and
  // Alerts) and report what actually happened. Nothing here is simulated.
  const sendTourTestAlert = async () => {
    const project = resolveScopeProject(projects, selectedProjectId);
    if (!project) {
      showError({ title: 'No project yet', message: 'Test alerts belong to a project.', hint: 'Create a project first, then try again.' });
      return;
    }
    try {
      const res = await authFetch('/api/v1/alerts', {
        method: 'POST',
        body: JSON.stringify({ projectId: project.id, thresholdType: 'PERCENT_80' }),
      });
      if (!res.ok) {
        showError({ title: 'Test alert not sent', message: await readApiError(res, 'The server refused the request.') });
        return;
      }
      const { alert } = (await res.json()) as { alert?: { status?: string } };
      if (alert?.status === 'QUEUED') {
        toast.success('Test alert queued for Slack', `${project.name}: delivery runs in the background. Its status (Sent or Failed) shows in Alerts.`);
      } else if (alert?.status === 'FAILED') {
        toast.error('Slack delivery could not be queued', 'The alert is in the in-app feed. Try again shortly.');
      } else {
        toast.info('Test alert recorded in-app', `${project.name} has no Slack webhook yet, so nothing was posted to Slack. Add one in Notifications.`);
      }
      fetchUnreadAlerts();
    } catch {
      showError({ title: 'Test alert not sent', message: 'The server could not be reached.' });
    }
  };

  // Once the first screen is complete, fetch the other workspaces' code in the background (idle, one at a time)
  const firstScreenReady = projectsLoaded && analytics !== null;
  useEffect(() => {
    if (!firstScreenReady || process.env.NEXT_PUBLIC_DISABLE_IDLE_PREFETCH === '1') return; // the flag exists for A/B measurement
    return prefetchWorkspacesWhenIdle();
  }, [firstScreenReady]);

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
    () => {
      const scope = selectedProjectId;
      const isCurrent = latestAnalytics.current.begin(); // an older, slower response is ignored
      return getJson<DashboardAnalytics>(
        selectedProjectId ? `/api/v1/analytics?projectId=${encodeURIComponent(selectedProjectId)}` : '/api/v1/analytics',
      )
        .then((data) => {
          if (isCurrent()) setAnalytics({ scope, data });
        })
        .catch((err) => console.error('Failed to fetch analytics:', err));
    },
    [selectedProjectId],
  );

  const fetchUnreadAlerts = useCallback(
    () =>
      getJson<{ alerts?: Array<{ isRead: boolean }> }>('/api/v1/alerts')
        .then((data) => setUnreadAlertsCount((data.alerts || []).filter((a) => !a.isRead).length))
        .catch((err) => console.error('Failed to fetch alert counts:', err)),
    [],
  );

  // One cheap counter query (no rows). Skipped while the tab is hidden so a forgotten background tab costs nothing.
  const fetchInboxUnread = useCallback(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return Promise.resolve();
    return getJson<{ unread?: number }>('/api/v1/notifications/inbox/unread-count')
      .then((data) => setInboxUnread(typeof data?.unread === 'number' ? data.unread : 0))
      .catch((err) => console.error('Failed to fetch inbox count:', err));
  }, []);

  const loadAll = useCallback(
    () => Promise.all([fetchProjects(), fetchKeys(), fetchAnalytics(), fetchUnreadAlerts(), fetchInboxUnread()]),
    [fetchProjects, fetchKeys, fetchAnalytics, fetchUnreadAlerts, fetchInboxUnread],
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
    // Live figures refresh every 12 s, but only while the tab is visible: a forgotten background tab makes no requests
    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      fetchAnalytics();
      fetchUnreadAlerts();
    }, 12000);
    // The inbox counter polls on its own, slower cadence (and refreshes when the tab becomes visible again)
    const inboxInterval = setInterval(fetchInboxUnread, 60000);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      // coming back to the tab: catch up at once instead of showing minutes-old figures until the next tick
      fetchInboxUnread();
      fetchAnalytics();
      fetchUnreadAlerts();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      clearInterval(inboxInterval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [accessToken, loadAll, fetchAnalytics, fetchUnreadAlerts, fetchInboxUnread]);

  return (
    <ScopeProvider scopeId={rawScopeId} onScopeChange={setScopeId} projects={projects}>
    <div className="flex h-screen w-screen overflow-hidden bg-surface-subtle text-sg-text-primary">
      {/* Navigation Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={navigate}
        pendingTab={pendingTab}
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
          onOpenPlayground={() => navigate('playground')}
          onRefreshData={refreshAll}
          isRefreshing={isRefreshing}
          unreadInbox={inboxUnread}
          onInboxUnreadChange={setInboxUnread}
          onNavigate={navigate}
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          onOpenHelp={() => setIsHelpOpen(true)}
          onOpenSettings={(section) => {
            setSettingsSection(section);
            navigate('settings');
          }}
        />

        {/* Dynamic Viewport Container */}
        <main className="flex-1 overflow-y-auto px-6 py-6 bg-surface-subtle scroll-smooth">
          <div className="max-w-7xl mx-auto">
            <PageTransition tabKey={currentTab}>
            {/* One boundary per workspace (keyed by tab, so switching tabs clears a failure); never nested */}
            <LazyBoundary key={currentTab} name={TAB_NAME[currentTab]}>
            {currentTab === 'overview' && (
              <OverviewView
                analyticsData={analyticsData}
                projectsCount={projects.length}
                hasProviderKeys={hasProviderKeys}
                hasGatewayKeys={hasGatewayKeys}
                onNavigateToProjects={() => navigate('projects')}
                onNavigateToPlayground={() => navigate('playground')}
                onNavigateToAudit={() => navigate('audit')}
                onNavigateToKeys={() => navigate('keys')}
              />
            )}

            {currentTab === 'insights' && <InsightsView />}

            {currentTab === 'projects' && (
              <ProjectsView
                projects={projects}
                onRefresh={refreshAll}
              />
            )}

            {currentTab === 'keys' && (
              <KeyVaultView />
            )}

            {currentTab === 'playground' && (
              <PlaygroundView onRefreshMetrics={refreshAll} />
            )}

            {currentTab === 'audit' && (
              <AuditView />
            )}

            {currentTab === 'alerts' && (
              <AlertsView onRefreshUnreadCount={fetchUnreadAlerts} />
            )}

            {currentTab === 'sdk' && (
              <SdkView />
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
                onNavigateToTeam={() => navigate('team')}
              />
            )}
            </LazyBoundary>
            </PageTransition>
          </div>
        </main>
      </div>

      {/* Post-Signup Welcome Modal */}
      {welcomeMounted && (
        <LazyBoundary name="The welcome guide" variant="overlay">
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
        </LazyBoundary>
      )}

      {/* Interactive product tour */}
      {tourMounted && (
        <LazyBoundary name="The product tour" variant="overlay">
          <ProductTour
            isActive={isTourActive}
            onClose={() => setIsTourActive(false)}
            onNavigateTab={(tab, section) => {
              if (section) setSettingsSection(section);
              navigate(tab);
            }}
            onSendTestAlert={sendTourTestAlert}
            onFinished={() => {
              // Same completion check as the setup wizard: a set-up org stays on the console
              if (destinationAfterTour({ onboardingState, projectCount: projects.length, projectsLoaded }) === 'onboarding') {
                router.push('/onboarding');
              }
            }}
          />
        </LazyBoundary>
      )}

      {/* In-Product Knowledge Base & Help Center */}
      {helpMounted && (
        <LazyBoundary name="The help center" variant="overlay">
          <HelpCenterModal
            isOpen={isHelpOpen}
            onClose={() => setIsHelpOpen(false)}
            onRestartTour={() => setIsTourActive(true)}
            onNavigateToSdk={() => navigate('sdk')}
          />
        </LazyBoundary>
      )}
    </div>
    </ScopeProvider>
  );
}
