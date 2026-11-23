'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  ShieldAlert,
  AlertTriangle,
  Send,
  Clock,
  Sliders,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { CardSkeleton } from '@/components/ui/LoadingSkeleton';
import { authFetch } from '@/lib/auth-fetch';

interface AlertItem {
  id: string;
  projectId: string;
  projectName?: string;
  thresholdType: 'PERCENT_80' | 'HARD_BLOCK' | 'ANOMALY_DETECTED';
  thresholdValue: number;
  channel: 'EMAIL' | 'SLACK' | 'IN_APP';
  title: string;
  message: string;
  isRead: boolean;
  status: string;
  deliveryError?: string | null;
  triggeredAt: string;
}

type TestThreshold = 'PERCENT_80' | 'HARD_BLOCK' | 'ANOMALY_DETECTED';

interface AlertsViewProps {
  projects: Array<{ id: string; name: string }>;
  onRefreshUnreadCount: () => void;
}

export function AlertsView({ projects, onRefreshUnreadCount }: AlertsViewProps) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Test alerts go to the first project (derived each render: projects load after mount)
  const testProjectId = projects[0]?.id;
  const [testThreshold, setTestThreshold] = useState<TestThreshold>('PERCENT_80');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const fetchAlerts = useCallback(
    () =>
      authFetch('/api/v1/alerts')
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then((data: { alerts?: AlertItem[] }) => setAlerts(data.alerts || []))
        .catch((err) => console.error('Failed to fetch alerts:', err))
        .finally(() => setIsLoading(false)),
    [],
  );

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // While a Slack delivery is still queued, re-check until it resolves to Sent or Failed.
  const hasQueued = alerts.some((a) => a.channel === 'SLACK' && a.status === 'QUEUED');
  useEffect(() => {
    if (!hasQueued) return;
    const timer = setInterval(fetchAlerts, 3000);
    return () => clearInterval(timer);
  }, [hasQueued, fetchAlerts]);

  const handleMarkAsRead = async (id?: string, markAll = false) => {
    try {
      await authFetch('/api/v1/alerts', {
        method: 'PATCH',
        body: JSON.stringify(markAll ? { markAllRead: true } : { id })
      });
      fetchAlerts();
      onRefreshUnreadCount();
    } catch (err) {
      console.error('Failed to update alert:', err);
    }
  };

  const handleSendTestAlert = async () => {
    if (!testProjectId) return;
    setIsSendingTest(true);
    try {
      const res = await authFetch('/api/v1/alerts', {
        method: 'POST',
        body: JSON.stringify({
          projectId: testProjectId,
          thresholdType: testThreshold,
        })
      });
      if (res.ok) {
        fetchAlerts();
        onRefreshUnreadCount();
      }
    } catch (err) {
      console.error('Failed to trigger test alert:', err);
    } finally {
      setIsSendingTest(false);
    }
  };

  const unreadCount = alerts.filter(a => !a.isRead).length;
  const hardBlockCount = alerts.filter(a => a.thresholdType === 'HARD_BLOCK').length;
  const spikeCount = alerts.filter(a => a.thresholdType === 'ANOMALY_DETECTED').length;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl font-normal text-fg tracking-tight">
            Alerts & Anomaly Notifications
          </h2>
          <p className="text-xs text-fg-secondary mt-1">
            Budget threshold warnings, hard blocks and spend-spike detections, shown in-app and, when a Slack webhook is set in Settings, posted to Slack.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => handleMarkAsRead(undefined, true)}
              className="px-4 py-2 rounded-full bg-surface hover:bg-surface-muted text-fg border border-line font-semibold text-xs shadow-2xs transition-colors"
            >
              Mark All as Read ({unreadCount})
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-subtle hover:bg-surface-muted text-fg border border-line text-xs font-semibold shadow-2xs transition-colors"
          >
            <Sliders className="w-3.5 h-3.5 text-fg-secondary" />
            <span>Test Alert</span>
          </button>
        </div>
      </div>

      {/* Aggregate Alert Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-surface p-5 rounded-card border border-line shadow-2xs">
        <div>
          <span className="text-caption font-mono font-medium uppercase tracking-wider text-fg-secondary">Unread Incidents</span>
          <p className={`font-serif text-2xl font-normal tabular-nums mt-1 ${unreadCount > 0 ? 'text-accent' : 'text-fg'}`}>
            {unreadCount}
          </p>
        </div>
        <div>
          <span className="text-caption font-mono font-medium uppercase tracking-wider text-fg-secondary">Hard-Blocks Tripped</span>
          <p className={`font-serif text-2xl font-normal tabular-nums mt-1 ${hardBlockCount > 0 ? 'text-critical' : 'text-fg'}`}>
            {hardBlockCount}
          </p>
        </div>
        <div>
          <span className="text-caption font-mono font-medium uppercase tracking-wider text-fg-secondary">Statistical Spikes</span>
          <p className={`font-serif text-2xl font-normal tabular-nums mt-1 ${spikeCount > 0 ? 'text-warning' : 'text-fg'}`}>
            {spikeCount}
          </p>
        </div>
        <div>
          <span className="text-caption font-mono font-medium uppercase tracking-wider text-fg-secondary">Delivery</span>
          <p className="font-serif text-2xl font-normal text-fg mt-1">
            {alerts.some((a) => a.channel === 'SLACK') ? 'In-app + Slack' : 'In-app'}
          </p>
        </div>
      </div>

      {/* Webhook Channel Configuration Accordion */}
      {showConfig && (
        <div className="bg-surface p-6 rounded-card border border-line shadow-2xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-line">
            <h3 className="font-serif text-lg font-normal text-fg">Test Alert</h3>
            <span className="text-xs text-fg-secondary">In-app, plus Slack if configured</span>
          </div>

          <p className="text-xs text-fg-secondary">
            A test alert goes through the same path as real ones. It always appears in this feed, and it is also sent to
            Slack when the project has a webhook (Settings → Notifications). The status next to each alert shows what
            actually happened. Email delivery of budget alerts is not available yet.
          </p>

          {/* Test Dispatch Bar */}
          <div className="pt-3 border-t border-line flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-fg-secondary font-medium">Test Trigger:</span>
              <select
                value={testThreshold}
                onChange={(e) => setTestThreshold(e.target.value as TestThreshold)}
                className="px-3 py-1.5 rounded-full border border-line text-xs bg-surface-subtle cursor-pointer"
              >
                <option value="PERCENT_80">80% Threshold Warning</option>
                <option value="HARD_BLOCK">Emergency 100% Hard-Block</option>
                <option value="ANOMALY_DETECTED">Statistical Spike Anomaly</option>
              </select>

            </div>

            <button
              type="button"
              onClick={handleSendTestAlert}
              disabled={isSendingTest || !testProjectId}
              title={testProjectId ? undefined : 'Create a project first'}
              className="px-4 py-2 rounded-full bg-code hover:bg-[#2E3033] text-white font-semibold text-xs shadow-2xs transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSendingTest ? 'Sending...' : 'Send Test Alert'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Incidents & Alerts List Table */}
      {isLoading ? (
        <CardSkeleton className="h-40" />
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No alerts triggered"
          description="Your AI project expenditures are healthy. Any budget threshold or anomaly triggers will appear here."
          compact
        />
      ) : (
        <div className="bg-surface rounded-card border border-line shadow-2xs overflow-hidden">
          <div className="divide-y divide-line">
            {alerts.map((alert) => {
              const isHardBlock = alert.thresholdType === 'HARD_BLOCK';
              const isAnomaly = alert.thresholdType === 'ANOMALY_DETECTED';

              return (
                <div
                  key={alert.id}
                  className={`p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                    !alert.isRead ? 'bg-surface-subtle' : 'hover:bg-surface-subtle'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div className="mt-0.5 shrink-0">
                      {isHardBlock ? (
                        <div className="w-8 h-8 rounded-field bg-critical-bg border border-critical-border text-critical flex items-center justify-center">
                          <ShieldAlert className="w-4 h-4" />
                        </div>
                      ) : isAnomaly ? (
                        <div className="w-8 h-8 rounded-field bg-warning-bg border border-warning-border text-warning flex items-center justify-center">
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-field bg-info-bg border border-info-border text-info flex items-center justify-center">
                          <Clock className="w-4 h-4" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-fg">{alert.title}</span>
                        {!alert.isRead && (
                          <span className="w-2 h-2 rounded-full bg-accent" />
                        )}
                        <span className="text-caption font-mono text-fg-muted">
                          {alert.projectName || alert.projectId}
                        </span>
                      </div>
                      <p className="text-xs text-fg-secondary leading-relaxed max-w-2xl">{alert.message}</p>
                      <div className="flex items-center gap-2 pt-1 text-label text-fg-muted font-mono tabular-nums">
                        <span>{new Date(alert.triggeredAt).toLocaleString()}</span>
                        <span>•</span>
                        <span>Channel: {alert.channel}</span>
                        {alert.channel === 'SLACK' && (
                          <span
                            title={alert.deliveryError || undefined}
                            className={
                              alert.status === 'SENT' ? 'text-success' : alert.status === 'FAILED' ? 'text-critical' : 'text-warning'
                            }
                          >
                            {alert.status === 'SENT'
                              ? '· Sent to Slack'
                              : alert.status === 'FAILED'
                                ? `· Slack delivery failed${alert.deliveryError ? `: ${alert.deliveryError}` : ''}`
                                : '· Sending to Slack…'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    {!alert.isRead && (
                      <button
                        type="button"
                        onClick={() => handleMarkAsRead(alert.id)}
                        className="px-3.5 py-1.5 rounded-full text-xs font-semibold text-fg-secondary hover:text-fg hover:bg-surface-muted transition-colors"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
