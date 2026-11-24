'use client';

import React, { useState } from 'react';
import { Hash, Mail, Send, Webhook } from 'lucide-react';
import { useApi } from '@/lib/use-api';
import { authFetch, readApiError } from '@/lib/auth-fetch';
import { useStoredUser } from '@/lib/client-storage';
import { formatDateTime, utcLabel } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog, InlineAlert, useToast } from '@/components/ui/feedback';

interface Channel {
  id: string;
  type: 'SLACK' | 'WEBHOOK' | 'EMAIL';
  name: string;
  destination: string | null;
  eventTypes: string[];
  enabled: boolean;
  stats: { sent: number; failed: number; pending: number };
}
interface Delivery {
  id: string;
  channelName: string;
  channelType: string;
  eventType: string;
  title: string | null;
  status: 'QUEUED' | 'RETRYING' | 'SENT' | 'FAILED';
  attempts: number;
  lastError: string | null;
  createdAt: string;
}

const EVENT_LABEL: Record<string, string> = {
  'budget.alert': 'Budget warnings, hard blocks and anomalies',
  'recommendation.created': 'New cost recommendations',
};
const TYPE_ICON = { SLACK: Hash, WEBHOOK: Webhook, EMAIL: Mail } as const;
const STATUS_TONE = { SENT: 'success', FAILED: 'critical', RETRYING: 'warning', QUEUED: 'neutral' } as const;

const FIELD = 'w-full px-3 py-2 rounded-field bg-surface border border-line text-xs text-fg focus:outline-none focus:border-accent';

/** Organization-level destinations for notifications. Destination details are write-only: they are never shown again. */
export function NotificationChannels() {
  const role = useStoredUser()?.role ?? 'MEMBER';
  const canManage = role === 'OWNER' || role === 'ADMIN';
  if (!canManage) {
    return <p className="text-label text-fg-muted">Only an owner or admin can manage organization notification channels.</p>;
  }
  return <ChannelManager />;
}

function ChannelManager() {
  const channels = useApi<{ channels: Channel[] }>('/api/v1/notifications/channels');
  const deliveries = useApi<{ deliveries: Delivery[] }>('/api/v1/notifications/deliveries?limit=15');
  const toast = useToast();
  // Tolerate an unexpected or partial response: show the empty state, never crash the Settings tab
  const channelList = Array.isArray(channels.data?.channels) ? channels.data!.channels : [];
  const deliveryList = Array.isArray(deliveries.data?.deliveries) ? deliveries.data!.deliveries : [];
  const [type, setType] = useState<Channel['type']>('WEBHOOK');
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [events, setEvents] = useState<string[]>(['budget.alert', 'recommendation.created']);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<{ channel: string; value: string } | null>(null);
  const [removing, setRemoving] = useState<Channel | null>(null);

  const reloadAll = () => {
    channels.reload();
    deliveries.reload();
  };

  const call = async (path: string, method: string, body?: unknown) => {
    const res = await authFetch(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) throw new Error(await readApiError(res, 'The request failed.'));
    return res.json().catch(() => ({}));
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const config = type === 'EMAIL' ? { recipients: destination.split(/[\s,;]+/).filter(Boolean) } : { url: destination.trim() };
      const out = await call('/api/v1/notifications/channels', 'POST', { type, name: name.trim(), config, eventTypes: events });
      if (out.signingSecret) setSecret({ channel: out.name, value: out.signingSecret });
      toast.success('Channel added', 'Send a test to confirm it works.');
      setName('');
      setDestination('');
      reloadAll();
    } catch (err) {
      toast.error('Channel not added', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      reloadAll();
    } catch (err) {
      toast.error('That did not work', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-5" data-testid="notification-channels">
      <div>
        <p className="text-xs font-semibold text-fg">Organization channels</p>
        <p className="text-label text-fg-muted max-w-xl">
          Send budget alerts and cost recommendations to Slack, email or your own systems (signed webhooks). Failed deliveries are retried automatically and every attempt is kept in the history below.
        </p>
      </div>

      {secret && (
        <InlineAlert variant="warning" title={`Signing secret for “${secret.channel}”: copy it now`}>
          <p>It is shown only once. Use it to verify the <code className="font-mono">X-SpendGuard-Signature</code> header (HMAC-SHA256 of <code className="font-mono">timestamp.body</code>).</p>
          <p className="mt-1 font-mono break-all select-all" data-testid="signing-secret">{secret.value}</p>
          <button type="button" className="mt-2 underline font-semibold" onClick={() => setSecret(null)}>I have stored it</button>
        </InlineAlert>
      )}

      {channelList.length ? (
        <ul className="divide-y divide-line border border-line rounded-field">
          {channelList.map((c) => {
            const Icon = TYPE_ICON[c.type];
            return (
              <li key={c.id} className="p-3 flex flex-wrap items-center gap-3" data-testid="channel-row">
                <Icon className="w-4 h-4 text-fg-secondary shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-fg truncate">{c.name} <span className="font-normal text-fg-muted">· {c.type.toLowerCase()}</span></p>
                  <p className="text-caption text-fg-muted truncate">
                    {c.destination} · {c.eventTypes.length ? c.eventTypes.map((t) => EVENT_LABEL[t] ?? t).join(', ') : 'all events'} · {c.stats.sent} sent{c.stats.failed ? `, ${c.stats.failed} failed` : ''}
                  </p>
                </div>
                {!c.enabled && <Badge tone="neutral">Paused</Badge>}
                <button type="button" className="px-2.5 py-1 rounded-full border border-line text-label font-semibold" onClick={() => act(() => call(`/api/v1/notifications/channels/${c.id}/test`, 'POST'), 'Test queued: check the history')}><Send className="w-3 h-3 inline mr-1" aria-hidden />Test</button>
                <button type="button" className="px-2.5 py-1 rounded-full border border-line text-label font-semibold" onClick={() => act(() => call(`/api/v1/notifications/channels/${c.id}`, 'PATCH', { enabled: !c.enabled }), c.enabled ? 'Paused' : 'Resumed')}>{c.enabled ? 'Pause' : 'Resume'}</button>
                {c.type === 'WEBHOOK' && (
                  <button type="button" className="px-2.5 py-1 rounded-full border border-line text-label font-semibold" onClick={() => act(async () => { const o = await call(`/api/v1/notifications/channels/${c.id}/rotate-secret`, 'POST'); setSecret({ channel: c.name, value: o.signingSecret }); }, 'Secret rotated')}>Rotate secret</button>
                )}
                <button type="button" className="px-2.5 py-1 rounded-full border border-critical-border text-critical text-label font-semibold" onClick={() => setRemoving(c)}>Remove</button>
              </li>
            );
          })}
        </ul>
      ) : (
        !channels.loading && <p className="text-label text-fg-muted">No channels yet. Alerts still appear in the in-app Alerts feed.</p>
      )}

      <form onSubmit={create} className="p-4 rounded-field bg-surface-subtle border border-line-strong space-y-3 max-w-xl" aria-label="Add a channel">
        <p className="text-xs font-semibold text-fg">Add a channel</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-label text-fg-secondary space-y-1">Type
            <select className={FIELD} value={type} onChange={(e) => setType(e.target.value as Channel['type'])}>
              <option value="WEBHOOK">Signed webhook</option>
              <option value="SLACK">Slack</option>
              <option value="EMAIL">Email</option>
            </select>
          </label>
          <label className="text-label text-fg-secondary space-y-1">Name
            <input className={FIELD} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required placeholder="e.g. Finance alerts" />
          </label>
        </div>
        <label className="block text-label text-fg-secondary space-y-1">{type === 'EMAIL' ? 'Recipients (comma separated, up to 10)' : type === 'SLACK' ? 'Slack incoming-webhook URL' : 'Destination URL (https)'}
          <input className={FIELD} value={destination} onChange={(e) => setDestination(e.target.value)} required placeholder={type === 'EMAIL' ? 'finance@example.com, cto@example.com' : type === 'SLACK' ? 'https://hooks.slack.com/services/…' : 'https://example.com/hooks/spendguard'} autoComplete="off" spellCheck={false} />
        </label>
        <fieldset className="space-y-1">
          <legend className="text-label text-fg-secondary">Send</legend>
          {Object.entries(EVENT_LABEL).map(([id, label]) => (
            <label key={id} className="flex items-center gap-2 text-label text-fg-secondary">
              <input type="checkbox" checked={events.includes(id)} onChange={(e) => setEvents((cur) => (e.target.checked ? [...cur, id] : cur.filter((x) => x !== id)))} /> {label}
            </label>
          ))}
        </fieldset>
        <p className="text-caption text-fg-muted">The destination is stored encrypted and is never shown again. Private and internal network addresses are not allowed.</p>
        <button type="submit" disabled={busy || !name.trim() || !destination.trim()} className="px-4 py-2 rounded-full bg-accent text-white text-xs font-semibold disabled:opacity-50">{busy ? 'Adding…' : 'Add channel'}</button>
      </form>

      <div>
        <p className="text-xs font-semibold text-fg mb-2">Delivery history</p>
        {deliveryList.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[36rem]">
              <thead className="text-fg-muted text-left"><tr><th className="py-1 font-medium">When</th><th className="font-medium">Channel</th><th className="font-medium">Event</th><th className="font-medium">Status</th><th className="font-medium">Detail</th><th /></tr></thead>
              <tbody>
                {deliveryList.map((d) => (
                  <tr key={d.id} className="border-t border-line align-top">
                    <td className="py-1.5 whitespace-nowrap" title={utcLabel(d.createdAt)}>{formatDateTime(d.createdAt)}</td>
                    <td>{d.channelName}</td>
                    <td className="max-w-[14rem] truncate" title={d.title ?? d.eventType}>{d.title ?? d.eventType}</td>
                    <td><Badge tone={STATUS_TONE[d.status]}>{d.status.toLowerCase()}</Badge> <span className="text-fg-muted">{d.attempts > 0 ? `×${d.attempts}` : ''}</span></td>
                    <td className="text-fg-muted max-w-[16rem]">{d.lastError ?? ''}</td>
                    <td>{d.status === 'FAILED' && d.channelType !== 'IN_APP' && <button type="button" className="underline font-semibold" onClick={() => act(() => call(`/api/v1/notifications/deliveries/${d.id}/retry`, 'POST'), 'Re-queued')}>Retry</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-label text-fg-muted">Nothing has been sent yet.</p>
        )}
      </div>

      <ConfirmDialog
        open={removing !== null}
        tone="danger"
        title="Remove this channel?"
        description={removing ? `“${removing.name}” will stop receiving notifications.` : ''}
        consequences={['Its delivery history is kept.', 'Anything still queued for it is not delivered.']}
        reversible="You can add it again, but a webhook gets a new signing secret."
        confirmLabel="Remove channel"
        onConfirm={async () => {
          if (removing) {
            await call(`/api/v1/notifications/channels/${removing.id}`, 'DELETE');
            reloadAll();
          }
        }}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}
