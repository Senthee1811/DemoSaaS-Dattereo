'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Send, Trash2 } from 'lucide-react';
import { authFetch, readApiError } from '@/lib/auth-fetch';
import { errorMessage } from '@/lib/types';

interface SlackConfig {
  slackUrlSaved: boolean;
  slackConfigured: boolean;
  lastSlackStatus: 'QUEUED' | 'SENT' | 'FAILED' | null;
  lastSlackError: string | null;
}

interface ProjectOption {
  id: string;
  name: string;
}

// Same shape the server enforces (it re-validates; this only gives instant feedback).
const SLACK_WEBHOOK_RE = /^https:\/\/hooks\.slack\.com\/(services|workflows|triggers)\/[A-Za-z0-9/_-]+$/;

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 40_000; // 3 attempts with 5s/10s backoff + 5s timeouts

function StatusBadge({ config }: { config: SlackConfig | null }) {
  if (!config) return null;
  let label = 'Not configured';
  let tone = 'text-[#888882]';
  if (config.slackConfigured) {
    label = 'Configured';
    tone = 'text-[#0D9488]';
  } else if (config.lastSlackStatus === 'FAILED') {
    label = 'Last send failed';
    tone = 'text-[#DC2626]';
  } else if (config.slackUrlSaved) {
    label = config.lastSlackStatus === 'QUEUED' ? 'Sending…' : 'Saved, not verified. Send a test alert';
    tone = 'text-[#D97706]';
  }
  return <span className={`text-[11px] font-semibold ${tone}`}>{label}</span>;
}

export function SlackAlertSettings() {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState('');
  const [config, setConfig] = useState<SlackConfig | null>(null);
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'remove' | 'test' | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    authFetch('/api/v1/projects')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { projects?: ProjectOption[] }) => {
        const list = data.projects || [];
        setProjects(list);
        setProjectId((cur) => cur || list[0]?.id || '');
      })
      .catch((err) => setLoadError(errorMessage(err, 'Could not load projects.')));
  }, []);

  const loadConfig = useCallback(async (id: string): Promise<SlackConfig | null> => {
    const res = await authFetch(`/api/v1/alerts/config?projectId=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(await readApiError(res, 'Could not load Slack status.'));
    return (await res.json()) as SlackConfig;
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    loadConfig(projectId)
      .then((c) => !cancelled && setConfig(c))
      .catch((err) => !cancelled && setLoadError(errorMessage(err, 'Could not load Slack status.')));
    return () => {
      cancelled = true;
    };
  }, [projectId, loadConfig]);

  const save = async (next: string | null) => {
    if (next !== null && !SLACK_WEBHOOK_RE.test(next.trim())) {
      setUrlError('Enter a Slack Incoming Webhook URL (https://hooks.slack.com/services/...).');
      return;
    }
    setUrlError(null);
    setNotice(null);
    setBusy(next === null ? 'remove' : 'save');
    try {
      const res = await authFetch('/api/v1/alerts/config', {
        method: 'PATCH',
        body: JSON.stringify({ projectId, slackWebhookUrl: next === null ? null : next.trim() }),
      });
      if (!res.ok) {
        setNotice({ kind: 'error', text: await readApiError(res, 'Could not save the webhook.') });
        return;
      }
      setConfig((await res.json()) as SlackConfig);
      setUrl('');
      setNotice({
        kind: 'ok',
        text: next === null ? 'Slack webhook removed.' : 'Webhook saved. Send a test alert to verify it works.',
      });
    } catch (err) {
      setNotice({ kind: 'error', text: errorMessage(err, 'Could not reach the server.') });
    } finally {
      setBusy(null);
    }
  };

  const sendTest = async () => {
    setNotice(null);
    setBusy('test');
    try {
      const res = await authFetch('/api/v1/alerts', {
        method: 'POST',
        body: JSON.stringify({ projectId, thresholdType: 'PERCENT_80' }),
      });
      if (!res.ok) {
        setNotice({ kind: 'error', text: await readApiError(res, 'Could not send the test alert.') });
        return;
      }
      const { alert } = (await res.json()) as { alert: { id: string; status: string; deliveryError?: string | null } };
      let status = alert.status;
      let error = alert.deliveryError ?? null;

      // Delivery happens in a background worker: wait for its real outcome.
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      while (status === 'QUEUED' && Date.now() < deadline && mounted.current) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const list = await authFetch(`/api/v1/alerts?projectId=${encodeURIComponent(projectId)}`);
        if (!list.ok) continue;
        const found = ((await list.json()) as { alerts?: Array<{ id: string; status: string; deliveryError?: string | null }> }).alerts?.find(
          (a) => a.id === alert.id,
        );
        if (found) {
          status = found.status;
          error = found.deliveryError ?? null;
        }
      }
      if (!mounted.current) return;

      if (status === 'SENT') setNotice({ kind: 'ok', text: 'Slack accepted the test alert. Check your channel.' });
      else if (status === 'FAILED') setNotice({ kind: 'error', text: `Slack delivery failed${error ? `: ${error}` : '.'}` });
      else if (status === 'IN_APP') setNotice({ kind: 'error', text: 'No webhook is saved for this project, so the test alert only appeared in the in-app feed.' });
      else setNotice({ kind: 'error', text: 'Still waiting on Slack. Check the Alerts page for the final status.' });
      setConfig(await loadConfig(projectId));
    } catch (err) {
      setNotice({ kind: 'error', text: errorMessage(err, 'Could not send the test alert.') });
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#E5E0D8] space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-[#141413]">Slack Webhook Notifications</p>
          <p className="text-[11px] text-[#888882]">
            Post budget and anomaly alerts for a project to a Slack channel through your own Incoming Webhook.
          </p>
        </div>
        <StatusBadge config={config} />
      </div>

      {loadError && <p className="text-[11px] text-[#DC2626]">{loadError}</p>}

      {projects.length === 0 && !loadError ? (
        <p className="text-[11px] text-[#888882]">Create a project first. Slack alerts are configured per project.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="slack-project" className="text-[#555550]">Project</label>
            <select
              id="slack-project"
              value={projectId}
              onChange={(e) => {
                // Reset per-project state here (not in an effect) when the selection changes.
                setProjectId(e.target.value);
                setConfig(null);
                setNotice(null);
                setUrl('');
                setUrlError(null);
              }}
              className="px-3 py-1 rounded-full border border-[#E4E4E0] bg-white text-xs cursor-pointer"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <input
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setUrlError(null);
              }}
              placeholder={config?.slackUrlSaved ? 'A webhook is saved. Paste a new URL to replace it' : 'https://hooks.slack.com/services/T000/B000/XXXX'}
              autoComplete="off"
              spellCheck={false}
              aria-label="Slack Incoming Webhook URL"
              aria-invalid={urlError ? true : undefined}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-white border border-[#E4E4E0] text-xs font-mono text-[#141413] placeholder-[#888882] focus:border-[#FF6B35] focus:outline-none"
            />
            {urlError && <p className="text-[11px] text-[#DC2626]">{urlError}</p>}
            <p className="text-[11px] text-[#888882]">The URL is stored encrypted and is never shown again.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => save(url)}
              disabled={busy !== null || !url.trim() || !projectId}
              className="px-4 py-2 rounded-full bg-[#141413] hover:bg-[#2E3033] text-white font-semibold text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === 'save' ? 'Saving…' : 'Save webhook'}
            </button>
            <button
              type="button"
              onClick={sendTest}
              disabled={busy !== null || !config?.slackUrlSaved}
              title={config?.slackUrlSaved ? undefined : 'Save a webhook first'}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white hover:bg-[#F3F3F0] text-[#141413] border border-[#E4E4E0] font-semibold text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === 'test' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>{busy === 'test' ? 'Waiting for Slack…' : 'Send test alert'}</span>
            </button>
            {config?.slackUrlSaved && (
              <button
                type="button"
                onClick={() => save(null)}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[#DC2626] hover:bg-[#FEF2F2] font-semibold text-xs transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{busy === 'remove' ? 'Removing…' : 'Remove'}</span>
              </button>
            )}
          </div>

          {notice && (
            <p role="status" className={`text-[11px] ${notice.kind === 'ok' ? 'text-[#0D9488]' : 'text-[#DC2626]'}`}>
              {notice.text}
            </p>
          )}
          {!notice && config?.lastSlackStatus === 'FAILED' && config.lastSlackError && (
            <p className="text-[11px] text-[#DC2626]">Last delivery failed: {config.lastSlackError}</p>
          )}
        </>
      )}
    </div>
  );
}
