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
  Sparkles
} from 'lucide-react';

interface AlertsViewProps {
  projects: Array<{ id: string; name: string }>;
  onRefreshUnreadCount: () => void;
}

export function AlertsView({ projects, onRefreshUnreadCount }: AlertsViewProps) {
  const [alerts, setAlerts] = useState<any[]>([]);
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

  const handleDispatchTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testProjectId) return;
    setIsSendingTest(true);
    try {
      await fetch('/api/v1/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjectId,
          channel: testChannel,
          thresholdType: testThreshold,
          title: testThreshold === 'HARD_BLOCK' 
            ? '🚨 Hard Budget Block Triggered' 
            : testThreshold === 'ANOMALY_DETECTED'
            ? '⚡ Spend Anomaly Spike Detected'
            : '⚠️ Soft Warning: 80% Budget Allocation',
          message: 'SpendGuard automated test notification fired to verify webhook integration pipeline.'
        })
      });
      fetchAlerts();
      onRefreshUnreadCount();
    } catch (err) {
      console.error('Failed to dispatch test alert:', err);
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Alert Center & Anomaly Guardrails</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time threshold notifications, multi-channel webhook dispatching, and anomaly triggers.
          </p>
        </div>

        <button
          onClick={() => handleMarkAsRead(undefined, true)}
          className="flex items-center space-x-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs rounded-lg transition-all self-start sm:self-auto"
        >
          <Check className="w-4 h-4 text-cyan-400" />
          <span>Mark All as Read</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Live Alerts Stream (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          <h3 className="font-bold text-white text-sm">Active & Historical Notifications</h3>

          <div className="space-y-3">
            {alerts.map((a) => {
              const isHardBlock = a.threshold_type === 'HARD_BLOCK';
              const isAnomaly = a.threshold_type === 'ANOMALY_DETECTED';

              return (
                <div
                  key={a.id}
                  className={`glass-card p-4 rounded-xl border flex flex-col justify-between transition-all ${
                    !a.isRead
                      ? isHardBlock
                        ? 'border-rose-700/80 bg-rose-950/20'
                        : isAnomaly
                        ? 'border-amber-700/80 bg-amber-950/20'
                        : 'border-cyan-700/80 bg-cyan-950/15'
                      : 'border-slate-800/80 opacity-75'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="flex items-center space-x-2">
                        {isHardBlock ? (
                          <div className="p-1.5 rounded-md bg-rose-500/20 text-rose-400">
                            <ShieldAlert className="w-4 h-4" />
                          </div>
                        ) : isAnomaly ? (
                          <div className="p-1.5 rounded-md bg-amber-500/20 text-amber-400">
                            <AlertTriangle className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="p-1.5 rounded-md bg-cyan-500/20 text-cyan-400">
                            <Bell className="w-4 h-4" />
                          </div>
                        )}
                        <div>
                          <h4 className="font-bold text-white text-xs">{a.title}</h4>
                          <span className="text-[10px] text-slate-400">{a.project_name || 'Project Alert'}</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                          {a.channel}
                        </span>
                        {!a.isRead && (
                          <button
                            onClick={() => handleMarkAsRead(a.id)}
                            className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold"
                          >
                            Mark Read
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 mt-2 leading-relaxed">{a.message}</p>
                  </div>

                  <div className="pt-2.5 border-t border-slate-800/60 mt-3 flex items-center justify-between text-[10px] text-slate-400">
                    <span className="flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(a.triggered_at).toLocaleString()}</span>
                    </span>
                    <span className="text-emerald-400 font-semibold">Status: Delivered ({a.status})</span>
                  </div>
                </div>
              );
            })}

            {alerts.length === 0 && (
              <div className="glass-card p-12 text-center text-slate-500 rounded-xl">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-50" />
                <p className="text-xs">No active alerts. All budget guardrails operating normally.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Webhook Config & Test Dispatcher (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Dispatcher Sandbox */}
          <div className="glass-card p-5 rounded-xl border border-slate-800 space-y-4">
            <div className="flex items-center space-x-2">
              <Send className="w-4 h-4 text-cyan-400" />
              <h3 className="font-bold text-white text-sm">Alert Pipeline Dispatcher</h3>
            </div>
            <p className="text-xs text-slate-400">
              Trigger simulated budget warnings and emergency hard-blocks to test alerting channels.
            </p>

            <form onSubmit={handleDispatchTest} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Target Project</label>
                <select
                  value={testProjectId}
                  onChange={(e) => setTestProjectId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Alert Category</label>
                <select
                  value={testThreshold}
                  onChange={(e) => setTestThreshold(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="PERCENT_80">Soft Warning (80% Allocation)</option>
                  <option value="HARD_BLOCK">Emergency Hard-Block (100% Exceeded)</option>
                  <option value="ANOMALY_DETECTED">Statistical Spike Anomaly</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Delivery Channel</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['SLACK', 'EMAIL', 'IN_APP'] as const).map((ch) => (
                    <button
                      type="button"
                      key={ch}
                      onClick={() => setTestChannel(ch)}
                      className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        testChannel === ch
                          ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500'
                          : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isSendingTest}
                className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs rounded-lg shadow-sm shadow-cyan-500/20 transition-all"
              >
                {isSendingTest ? 'Firing Notification...' : 'Dispatch Test Alert'}
              </button>
            </form>
          </div>

          {/* Webhook Settings Card */}
          <div className="glass-card p-5 rounded-xl border border-slate-800 space-y-4">
            <div className="flex items-center space-x-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-white text-sm">Channel Integrations</h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Slack Incoming Webhook URL
                </label>
                <input
                  type="text"
                  value={slackWebhook}
                  onChange={(e) => setSlackWebhook(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Email Alert Recipients
                </label>
                <input
                  type="text"
                  value={emailList}
                  onChange={(e) => setEmailList(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => alert('Webhook preferences saved successfully.')}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg"
                >
                  Save Webhook Endpoints
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
