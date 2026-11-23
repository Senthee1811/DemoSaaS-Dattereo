'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, History, KeyRound, LogIn, LogOut, ShieldAlert, ShieldX } from 'lucide-react';
import { useApi } from '@/lib/use-api';
import { formatDateTime, utcLabel } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { InlineAlert } from '@/components/ui/feedback';
import { Tip } from '@/components/ui/tooltip';
import { SectionCard } from './SectionCard';
import type { SecurityActivityData } from './types';

const PAGE_SIZE = 10;

const EVENTS: Record<string, { label: string; icon: React.ElementType; tone: 'success' | 'critical' | 'neutral' | 'warning' }> = {
  LOGIN_SUCCESS: { label: 'Signed in', icon: LogIn, tone: 'success' },
  LOGIN_FAILED: { label: 'Failed sign-in attempt', icon: ShieldAlert, tone: 'critical' },
  LOGOUT: { label: 'Signed out', icon: LogOut, tone: 'neutral' },
  PASSWORD_CHANGED: { label: 'Password changed', icon: KeyRound, tone: 'warning' },
  PASSWORD_RESET: { label: 'Password reset', icon: KeyRound, tone: 'warning' },
  SESSION_REVOKED: { label: 'A session was signed out', icon: ShieldX, tone: 'neutral' },
  OTHER_SESSIONS_REVOKED: { label: 'Other sessions were signed out', icon: ShieldX, tone: 'neutral' },
};

/** Your own security events from the audit log, newest first. Nothing here is invented. */
export function ActivityCard({ reloadKey }: { reloadKey: number }) {
  const [offset, setOffset] = useState(0);
  // reloadKey changes after a security action so the new event shows up
  const { data, loading, error } = useApi<SecurityActivityData>(`/api/auth/security-activity?limit=${PAGE_SIZE}&offset=${offset}&r=${reloadKey}`);
  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  return (
    <SectionCard icon={History} title="Security activity" description="Sign-ins, password changes and session changes on your account. Times are shown in your time zone.">
      {error && !data && (
        <InlineAlert variant="error" title="Could not load your security activity">
          {error}
        </InlineAlert>
      )}
      {loading && !data && !error && <p role="status" className="text-xs text-fg-secondary">Loading…</p>}

      {data && data.events.length === 0 && <p className="text-xs text-fg-secondary">No security events recorded yet.</p>}

      {data && data.events.length > 0 && (
        <ul className="divide-y divide-line rounded-field border border-line">
          {data.events.map((e) => {
            const meta = EVENTS[e.type] ?? { label: e.type, icon: History, tone: 'neutral' as const };
            const Icon = meta.icon;
            return (
              <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className="w-4 h-4 text-fg-muted shrink-0" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-fg flex items-center gap-2 flex-wrap">
                      {meta.label}
                      {e.type === 'LOGIN_FAILED' && <Badge tone="critical">Not you?</Badge>}
                    </p>
                    {(e.device || e.ip) && (
                      <p className="text-label text-fg-muted truncate">{[e.device, e.ip].filter(Boolean).join(' · ')}</p>
                    )}
                  </div>
                </div>
                <time dateTime={e.at} title={utcLabel(e.at)} className="text-label font-mono text-fg-secondary shrink-0 tabular-nums">
                  {formatDateTime(e.at)}
                </time>
              </li>
            );
          })}
        </ul>
      )}

      {data && total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-label text-fg-secondary">
          <span>
            {from}-{to} of {total}
          </span>
          <div className="flex items-center gap-1.5">
            <Tip label="Newer">
              <button
                type="button"
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                disabled={offset === 0}
                aria-label="Newer events"
                className="p-1.5 rounded-full border border-line hover:bg-surface-muted disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </Tip>
            <Tip label="Older">
              <button
                type="button"
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                disabled={to >= total}
                aria-label="Older events"
                className="p-1.5 rounded-full border border-line hover:bg-surface-muted disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </Tip>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
