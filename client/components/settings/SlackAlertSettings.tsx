'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Send, Trash2 } from 'lucide-react';
import { authFetch, readApiError } from '@/lib/auth-fetch';
import { errorMessage } from '@/lib/types';
import { ConfirmDialog, InlineAlert, useToast } from '@/components/ui/feedback';
import { useScopeProject } from '@/lib/scope';

interface SlackConfig {
  slackUrlSaved: boolean;
  slackConfigured: boolean;
  lastSlackStatus: 'QUEUED' | 'SENT' | 'FAILED' | null;
  lastSlackError: string | null;
}

// Same shape the server enforces (it re-validates; this only gives instant feedback).
const SLACK_WEBHOOK_RE = /^https:\/\/hooks\.slack\.com\/(services|workflows|triggers)\/[A-Za-z0-9/_-]+$/;

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 40_000; // 3 attempts with 5s/10s backoff + 5s timeouts

function StatusBadge({ config }: { config: SlackConfig | null }) {
  if (!config) return null;
  let label = 'Not configured';
  let tone = 'text-fg-muted';
  if (config.slackConfigured) {
    label = 'Configured';
    tone = 'text-success';
  } else if (config.lastSlackStatus === 'FAILED') {
    label = 'Last send failed';
    tone = 'text-critical';
  } else if (config.slackUrlSaved) {
    label = config.lastSlackStatus === 'QUEUED' ? 'Sending…' : 'Saved, not verified. Send a test alert';
    tone = 'text-warning';
  }
  return <span className={`text-label font-semibold ${tone}`}>{label}</span>;
}

/**
 * Slack alerts for the project in the global Scope. This wrapper is the only thing that reads
 * Scope; the form below is keyed by the project, so changing Scope remounts it with clean state
 * (no stale webhook status, no half-typed URL carried over to another project).
 */
export function SlackAlertSettings() {
  const { project, isFallback } = useScopeProject();
  if (!project) {
    return (
      <div className="p-4 rounded-field bg-surface-subtle border border-line-strong">
        <p className="text-xs font-semibold text-fg">Slack Webhook Notifications</p>
        <p className="text-label text-fg-muted mt-1">Create a project first. Slack alerts are configured per project.</p>
      </div>
    );
  }
  return <SlackAlertForm key={project.id} projectId={project.id} projectName={project.name} isFallback={isFallback} />;
}

function SlackAlertForm({ projectId, projectName, isFallback }: { projectId: string; projectName: string; isFallback: boolean }) {
  const [config, setConfig] = useState<SlackConfig | null>(null);
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const toast = useToast();
  const [loadError, setLoadError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
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
    setBusy('save');
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
    <div className="p-4 rounded-field bg-surface-subtle border border-line-strong space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-fg">Slack Webhook Notifications</p>
          <p className="text-label text-fg-muted">
            Post budget and anomaly alerts for a project to a Slack channel through your own Incoming Webhook.
          </p>
        </div>
        <StatusBadge config={config} />
      </div>

      {loadError && <InlineAlert variant="error" title="Could not load Slack settings">{loadError}</InlineAlert>}

      {(
        <>
          <p className="text-xs text-fg-secondary">
            Project: <span className="font-semibold text-fg">{projectName}</span>
            <span className="text-fg-muted">
              {isFallback ? ' (first project: pick one in Scope to change it)' : ' (from your Scope)'}
            </span>
          </p>

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
              className="w-full px-3.5 py-2.5 rounded-field bg-surface border border-line text-xs font-mono text-fg placeholder-fg-muted focus:border-accent focus:outline-none"
            />
            {urlError && <p className="text-label text-critical">{urlError}</p>}
            <p className="text-label text-fg-muted">The URL is stored encrypted and is never shown again.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => save(url)}
              disabled={busy !== null || !url.trim() || !projectId}
              className="px-4 py-2 rounded-full bg-code hover:bg-[#2E3033] text-white font-semibold text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === 'save' ? 'Saving…' : 'Save webhook'}
            </button>
            <button
              type="button"
              onClick={sendTest}
              disabled={busy !== null || !config?.slackUrlSaved}
              title={config?.slackUrlSaved ? undefined : 'Save a webhook first'}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-surface hover:bg-surface-muted text-fg border border-line font-semibold text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === 'test' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>{busy === 'test' ? 'Waiting for Slack…' : 'Send test alert'}</span>
            </button>
            {config?.slackUrlSaved && (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-critical hover:bg-critical-bg font-semibold text-xs transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            )}
          </div>

          {notice && <InlineAlert variant={notice.kind === 'ok' ? 'success' : 'error'} title={notice.text} />}
          {!notice && config?.lastSlackStatus === 'FAILED' && config.lastSlackError && (
            <InlineAlert variant="error" title="Last delivery failed">{config.lastSlackError}</InlineAlert>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmRemove}
        tone="danger"
        title="Remove this project's Slack webhook?"
        description="Budget and anomaly alerts for this project stop being posted to Slack. They still appear in the in-app Alerts feed."
        reversible="The stored URL is deleted. To turn Slack alerts back on, paste the webhook URL again."
        confirmLabel="Remove webhook"
        onConfirm={async () => {
          const res = await authFetch('/api/v1/alerts/config', {
            method: 'PATCH',
            body: JSON.stringify({ projectId, slackWebhookUrl: null }),
          });
          if (!res.ok) throw new Error(await readApiError(res, 'Could not remove the webhook.'));
          setConfig((await res.json()) as SlackConfig);
          setNotice(null);
          toast.success('Slack webhook removed');
        }}
        onClose={() => setConfirmRemove(false)}
      />
    </div>
  );
}
