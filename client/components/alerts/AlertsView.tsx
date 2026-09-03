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
  Flame, 
  CheckCircle2,
  Clock,
  Sparkles,
  RefreshCw,
  Activity,
  Layers
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

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
  const [slackWebhook, setSlackWebhook] = useState('https://api.spendguard.dev/webhooks/slack-alerts');
  const [emailList, setEmailList] = useState('eng-leads@apexai.io, cto@apexai.io');

  const fetchAlerts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/alerts');
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
      await fetch('/api/v1/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch('/api/v1/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[#111111] tracking-tight">
            Alerts & Anomaly Notifications
          </h2>
          <p className="text-xs sm:text-sm text-[#666666] mt-0.5">
            Real-time threshold triggers, statistical spike flags, and Slack/email webhook audit feeds.
          </p>
        </div>

        {alerts.some(a => !a.isRead) && (
          <button
            type="button"
            onClick={() => handleMarkAsRead(undefined, true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#E8E8E8] text-xs font-bold text-[#111111] hover:text-[#FF6B35] transition-all"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Mark All As Read</span>
          </button>
        )}
      </div>

      {/* Grid: Alerts Feed + Notification Webhooks Config */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Live Alerts Stream (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-6 sm:p-7 border border-[#E8E8E8] shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE7]">
            <h3 className="text-base font-bold text-[#111111]">
              Triggered Governance Alerts ({alerts.length})
            </h3>
            <button
              type="button"
              onClick={fetchAlerts}
              className="p-1.5 text-[#666666] hover:text-[#111111] rounded-lg"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#FF6B35]' : ''}`} />
            </button>
          </div>

          {alerts.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="No alerts triggered"
              description="Your projects are currently healthy and well within configured budget parameters."
              compact
            />
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    !alert.isRead
                      ? alert.thresholdType === 'HARD_BLOCK'
                        ? 'bg-red-50/50 border-red-200'
                        : 'bg-[#FFF8F5] border-[#FFD9C7]'
                      : 'bg-white border-[#E8E8E8]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-xl mt-0.5 ${
                        alert.thresholdType === 'HARD_BLOCK'
                          ? 'bg-red-100 text-red-600'
                          : alert.thresholdType === 'ANOMALY_DETECTED'
                          ? 'bg-amber-100 text-amber-600'
                          : 'bg-[#FFF1EA] text-[#FF6B35]'
                      }`}>
                        {alert.thresholdType === 'HARD_BLOCK' ? (
                          <ShieldAlert className="w-4 h-4" />
                        ) : alert.thresholdType === 'ANOMALY_DETECTED' ? (
                          <Activity className="w-4 h-4" />
                        ) : (
                          <AlertTriangle className="w-4 h-4" />
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-[#111111]">{alert.title}</h4>
                          {!alert.isRead && (
                            <span className="w-2 h-2 rounded-full bg-[#FF6B35] animate-pulse" />
                          )}
                        </div>

                        <p className="text-xs text-[#555555] mt-1 leading-relaxed">
                          {alert.message}
                        </p>

                        <div className="flex items-center gap-3 mt-2 text-[10.5px] text-[#777777]">
                          <span className="font-semibold text-[#111111]">
                            {alert.projectName || alert.projectId}
                          </span>
                          <span>·</span>
                          <span className="font-mono">{new Date(alert.triggeredAt).toLocaleTimeString()}</span>
                          <span>·</span>
                          <span className="font-mono text-[#FF6B35] font-semibold">{alert.channel}</span>
                        </div>
                      </div>
                    </div>

                    {!alert.isRead && (
                      <button
                        type="button"
                        onClick={() => handleMarkAsRead(alert.id)}
                        className="p-1 text-[#888888] hover:text-[#111111]"
                        title="Mark as read"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Webhook Simulator & Integration Test (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-3xl p-6 sm:p-7 border border-[#E8E8E8] shadow-sm space-y-5">
          <div className="pb-3 border-b border-[#F0ECE7]">
            <h3 className="text-base font-bold text-[#111111]">
              Webhook & Alert Simulator
            </h3>
            <p className="text-xs text-[#777777] mt-0.5">
              Verify Slack and email webhook integration payloads.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1">
                Project Scope
              </label>
              <select
                value={testProjectId}
                onChange={(e) => setTestProjectId(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-[#E8E8E8] text-xs font-semibold text-[#111111] bg-[#FFF8F5] focus:outline-none focus:border-[#FF6B35]"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1">
                Alert Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'PERCENT_80', label: '80% Soft Warning' },
                  { id: 'HARD_BLOCK', label: '100% Hard Block' },
                  { id: 'ANOMALY_DETECTED', label: 'Token Spike' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTestThreshold(t.id as any)}
                    className={`py-2 px-1 rounded-xl text-[11px] font-bold text-center border transition-all ${
                      testThreshold === t.id
                        ? 'bg-[#FFF1EA] text-[#FF6B35] border-[#FF6B35]'
                        : 'bg-white text-[#666666] border-[#E8E8E8]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1">
                Notification Channel
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'SLACK', icon: MessageSquare, label: 'Slack' },
                  { id: 'EMAIL', icon: Mail, label: 'Email' },
                  { id: 'IN_APP', icon: Bell, label: 'In-App' },
                ].map((c) => {
                  const Icon = c.icon;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setTestChannel(c.id as any)}
                      className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                        testChannel === c.id
                          ? 'bg-[#FFF1EA] text-[#FF6B35] border-[#FF6B35]'
                          : 'bg-white text-[#666666] border-[#E8E8E8]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1">
                Webhook Destination
              </label>
              <input
                type="text"
                value={testChannel === 'SLACK' ? slackWebhook : emailList}
                onChange={(e) => testChannel === 'SLACK' ? setSlackWebhook(e.target.value) : setEmailList(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-[#E8E8E8] text-xs font-medium text-[#111111] focus:outline-none focus:border-[#FF6B35]"
              />
            </div>

            <button
              type="button"
              onClick={handleSendTestAlert}
              disabled={isSendingTest}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] text-white font-bold text-xs shadow-sm hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {isSendingTest ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Dispatching Webhook...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Test Alert Notification</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
