'use client';

import React, { useState, useEffect, useCallback } from 'react';
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

export default function AppDashboard() {
  const [currentTab, setCurrentTab] = useState<NavTab>('overview');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [projects, setProjects] = useState<any[]>([]);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch Projects List
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/projects');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    }
  }, []);

  // Fetch Analytics Metrics
  const fetchAnalytics = useCallback(async () => {
    try {
      const url = selectedProjectId ? `/api/v1/analytics?projectId=${selectedProjectId}` : '/api/v1/analytics';
      const res = await fetch(url);
      const data = await res.json();
      setAnalyticsData(data);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    }
  }, [selectedProjectId]);

  // Fetch Unread Alerts
  const fetchUnreadAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/alerts');
      const data = await res.json();
      const unread = (data.alerts || []).filter((a: any) => !a.isRead).length;
      setUnreadAlertsCount(unread);
    } catch (err) {
      console.error('Failed to fetch alert counts:', err);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([fetchProjects(), fetchAnalytics(), fetchUnreadAlerts()]);
    setIsRefreshing(false);
  }, [fetchProjects, fetchAnalytics, fetchUnreadAlerts]);

  useEffect(() => {
    refreshAll();
    const interval = setInterval(() => {
      fetchAnalytics();
      fetchUnreadAlerts();
    }, 12000);
    return () => clearInterval(interval);
  }, [selectedProjectId, refreshAll, fetchAnalytics, fetchUnreadAlerts]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#FAFAFA] text-[#111111]">
      {/* Navigation Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        unreadAlertsCount={unreadAlertsCount}
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
        />

        {/* Dynamic Viewport Container */}
        <main className="flex-1 overflow-y-auto px-6 py-6 bg-[#FAFAFA] scroll-smooth">
          <div className="max-w-7xl mx-auto">
            {currentTab === 'overview' && (
              <OverviewView
                analyticsData={analyticsData}
                onNavigateToProjects={() => setCurrentTab('projects')}
                onNavigateToPlayground={() => setCurrentTab('playground')}
                onNavigateToAudit={() => setCurrentTab('audit')}
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
          </div>
        </main>
      </div>
    </div>
  );
}
