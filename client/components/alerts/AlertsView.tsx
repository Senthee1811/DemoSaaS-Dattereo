'use client';

import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  ShieldAlert, 
  AlertTriangle, 
  Check, 
  Send, 
  Mail, 
  MessageSquare, 
  CheckCircle2,
  Clock,
  RefreshCw,
  Sliders,
  ExternalLink
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
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
  triggeredAt: string;
}

interface AlertsViewProps {
  projects: Array<{ id: string; name: string }>;
  onRefreshUnreadCount: () => void;
}

export function AlertsView({ projects, onRefreshUnreadCount }: AlertsViewProps) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [testProjectId, setTestProjectId] = useState(projects[0]?.id || '');
  const [testChannel, setTestChannel] = useState<'SLACK' | 'EMAIL' | 'IN_APP'>('SLACK');
  const [testThreshold, setTestThreshold] = useState<'PERCENT_80' | 'HARD_BLOCK' | 'ANOMALY_DETECTED'>('PERCENT_80');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [slackWebhook, setSlackWebhook] = useState('https://hooks.slack.com/services/spendguard/alerts');
  const [emailList, setEmailList] = useState('eng-leads@company.com');
  const [showConfig, setShowConfig] = useState(false);

  const fetchAlerts = async () => {
    setIsLoading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('spendguard_token') : null;
      const res = await authFetch('/api/v1/alerts', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const handleMarkAsRead = async (id?: string, markAll = false) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('spendguard_token') : null;
      await authFetch('/api/v1/alerts', {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ id, isRead: true, markAllRead: markAll })
      });
      fetchAlerts();
      onRefreshUnreadCount();
    } catch (err) {
      console.error('Failed to update alert:', err);
    }
  };

  const handleSendTestAlert = async () => {
    setIsSendingTest(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('spendguard_token') : null;
      const res = await authFetch('/api/v1/alerts', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          projectId: testProjectId || projects[0]?.id || 'proj_copilot',
          thresholdType: testThreshold,
          channel: testChannel,
          slackWebhookUrl: slackWebhook,
          emailRecipients: emailList.split(',').map(s => s.trim())
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
            Automated threshold notifications, statistical Z-score spike detections, and incident dispatching.
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
            <span>Webhook Config</span>
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
          <span className="text-[10px] font-mono font-medium uppercase tracking-wider text-[#5F6368]">Dispatch Latency</span>
          <p className="font-serif text-2xl font-normal text-[#0D9488] tabular-nums mt-1">&lt; 100ms</p>
        </div>
      </div>

      {/* Webhook Channel Configuration Accordion */}
      {showConfig && (
        <div className="bg-white p-6 rounded-[24px] border border-[#E4E4E0] shadow-2xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#E4E4E0]">
            <h3 className="font-serif text-lg font-normal text-[#141413]">Notification Channel & Webhook Dispatch</h3>
            <span className="text-xs text-[#5F6368]">Slack BlockKit, Email, and PagerDuty endpoints</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="font-semibold text-[#141413] block mb-1.5">Slack Incoming Webhook URL</label>
              <input
                type="text"
                value={slackWebhook}
                onChange={(e) => setSlackWebhook(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl border border-[#E4E4E0] font-mono text-xs text-[#141413] focus:outline-none focus:border-[#FF6B35]"
              />
            </div>
            <div>
              <label className="font-semibold text-[#141413] block mb-1.5">Email Alert Recipients (comma-separated)</label>
              <input
                type="text"
                value={emailList}
                onChange={(e) => setEmailList(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl border border-[#E4E4E0] text-xs text-[#141413] focus:outline-none focus:border-[#FF6B35]"
              />
            </div>
          </div>

          {/* Test Dispatch Bar */}
          <div className="pt-3 border-t border-[#E4E4E0] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-[#5F6368] font-medium">Test Trigger:</span>
              <select
                value={testThreshold}
                onChange={(e) => setTestThreshold(e.target.value as any)}
                className="px-3 py-1.5 rounded-full border border-[#E4E4E0] text-xs bg-[#FAF8F5] cursor-pointer"
              >
                <option value="PERCENT_80">80% Threshold Warning</option>
                <option value="HARD_BLOCK">Emergency 100% Hard-Block</option>
                <option value="ANOMALY_DETECTED">Statistical Spike Anomaly</option>
              </select>

              <select
                value={testChannel}
                onChange={(e) => setTestChannel(e.target.value as any)}
                className="px-3 py-1.5 rounded-full border border-[#E4E4E0] text-xs bg-[#FAF8F5] cursor-pointer"
              >
                <option value="SLACK">Slack</option>
                <option value="EMAIL">Email</option>
                <option value="IN_APP">In-App</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleSendTestAlert}
              disabled={isSendingTest}
              className="px-4 py-2 rounded-full bg-[#141413] hover:bg-[#2E3033] text-white font-semibold text-xs shadow-2xs transition-colors flex items-center gap-2"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSendingTest ? 'Dispatching...' : 'Dispatch Test Alert'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Incidents & Alerts List Table */}
      {alerts.length === 0 ? (
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
