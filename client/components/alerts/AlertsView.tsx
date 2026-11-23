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
        body: JSON.stringify({ id, isRead: true, markAllRead: markAll })
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
          <h2 className="font-serif text-2xl font-normal text-[#141413] tracking-tight">
            Alerts & Anomaly Notifications
          </h2>
          <p className="text-xs text-[#5F6368] mt-1">
            Budget threshold warnings, hard blocks and spend-spike detections, shown in-app and, when a Slack webhook is set in Settings, posted to Slack.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => handleMarkAsRead(undefined, true)}
              className="px-4 py-2 rounded-full bg-white hover:bg-[#F3F3F0] text-[#141413] border border-[#E4E4E0] font-semibold text-xs shadow-2xs transition-colors"
            >
              Mark All as Read ({unreadCount})
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FAF8F5] hover:bg-[#F3F3F0] text-[#141413] border border-[#E4E4E0] text-xs font-semibold shadow-2xs transition-colors"
          >
            <Sliders className="w-3.5 h-3.5 text-[#5F6368]" />
            <span>Test Alert</span>
          </button>
        </div>
      </div>

      {/* Aggregate Alert Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-white p-5 rounded-[24px] border border-[#E4E4E0] shadow-2xs">
        <div>
          <span className="text-[10px] font-mono font-medium uppercase tracking-wider text-[#5F6368]">Unread Incidents</span>
          <p className={`font-serif text-2xl font-normal tabular-nums mt-1 ${unreadCount > 0 ? 'text-[#FF6B35]' : 'text-[#141413]'}`}>
            {unreadCount}
          </p>
        </div>
        <div>
          <span className="text-[10px] font-mono font-medium uppercase tracking-wider text-[#5F6368]">Hard-Blocks Tripped</span>
          <p className={`font-serif text-2xl font-normal tabular-nums mt-1 ${hardBlockCount > 0 ? 'text-[#DC2626]' : 'text-[#141413]'}`}>
            {hardBlockCount}
          </p>
        </div>
        <div>
          <span className="text-[10px] font-mono font-medium uppercase tracking-wider text-[#5F6368]">Statistical Spikes</span>
          <p className={`font-serif text-2xl font-normal tabular-nums mt-1 ${spikeCount > 0 ? 'text-[#D97706]' : 'text-[#141413]'}`}>
            {spikeCount}
          </p>
        </div>
        <div>
          <span className="text-[10px] font-mono font-medium uppercase tracking-wider text-[#5F6368]">Delivery</span>
          <p className="font-serif text-2xl font-normal text-[#141413] mt-1">
            {alerts.some((a) => a.channel === 'SLACK') ? 'In-app + Slack' : 'In-app'}
          </p>
        </div>
      </div>

      {/* Webhook Channel Configuration Accordion */}
      {showConfig && (
        <div className="bg-white p-6 rounded-[24px] border border-[#E4E4E0] shadow-2xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#E4E4E0]">
            <h3 className="font-serif text-lg font-normal text-[#141413]">Test Alert</h3>
            <span className="text-xs text-[#5F6368]">In-app, plus Slack if configured</span>
          </div>

          <p className="text-xs text-[#5F6368]">
            A test alert goes through the same path as real ones. It always appears in this feed, and it is also sent to
            Slack when the project has a webhook (Settings → Notifications). The status next to each alert shows what
            actually happened. Email delivery of budget alerts is not available yet.
          </p>

          {/* Test Dispatch Bar */}
          <div className="pt-3 border-t border-[#E4E4E0] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-[#5F6368] font-medium">Test Trigger:</span>
              <select
                value={testThreshold}
                onChange={(e) => setTestThreshold(e.target.value as TestThreshold)}
                className="px-3 py-1.5 rounded-full border border-[#E4E4E0] text-xs bg-[#FAF8F5] cursor-pointer"
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
              className="px-4 py-2 rounded-full bg-[#141413] hover:bg-[#2E3033] text-white font-semibold text-xs shadow-2xs transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="bg-white rounded-[24px] border border-[#E4E4E0] shadow-2xs overflow-hidden">
          <div className="divide-y divide-[#E4E4E0]">
            {alerts.map((alert) => {
              const isHardBlock = alert.thresholdType === 'HARD_BLOCK';
              const isAnomaly = alert.thresholdType === 'ANOMALY_DETECTED';

              return (
                <div
                  key={alert.id}
                  className={`p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                    !alert.isRead ? 'bg-[#FFFDFB]' : 'hover:bg-[#FAF8F5]'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div className="mt-0.5 shrink-0">
                      {isHardBlock ? (
                        <div className="w-8 h-8 rounded-2xl bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] flex items-center justify-center">
                          <ShieldAlert className="w-4 h-4" />
                        </div>
                      ) : isAnomaly ? (
                        <div className="w-8 h-8 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] text-[#D97706] flex items-center justify-center">
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-2xl bg-[#EFF6FF] border border-[#BFDBFE] text-[#2563EB] flex items-center justify-center">
                          <Clock className="w-4 h-4" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-[#141413]">{alert.title}</span>
                        {!alert.isRead && (
                          <span className="w-2 h-2 rounded-full bg-[#FF6B35]" />
                        )}
                        <span className="text-[10px] font-mono text-[#80868B]">
                          {alert.projectName || alert.projectId}
                        </span>
                      </div>
                      <p className="text-xs text-[#5F6368] leading-relaxed max-w-2xl">{alert.message}</p>
                      <div className="flex items-center gap-2 pt-1 text-[11px] text-[#80868B] font-mono tabular-nums">
                        <span>{new Date(alert.triggeredAt).toLocaleString()}</span>
                        <span>•</span>
                        <span>Channel: {alert.channel}</span>
                        {alert.channel === 'SLACK' && (
                          <span
                            title={alert.deliveryError || undefined}
                            className={
                              alert.status === 'SENT' ? 'text-[#0D9488]' : alert.status === 'FAILED' ? 'text-[#DC2626]' : 'text-[#D97706]'
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
                        className="px-3.5 py-1.5 rounded-full text-xs font-semibold text-[#5F6368] hover:text-[#141413] hover:bg-[#F3F3F0] transition-colors"
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
