import React from 'react';
import { Activity, KeyRound, MonitorSmartphone, ShieldAlert, ShieldCheck, UserRound } from 'lucide-react';
import { formatDateTime, utcLabel } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { InlineAlert } from '@/components/ui/feedback';
import { SectionCard } from './SectionCard';
import type { SecurityOverviewData } from './types';

function Fact({ icon: Icon, label, children, hint }: { icon: React.ElementType; label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-field border border-line bg-surface-subtle p-4 space-y-1.5 min-w-0">
      <p className="text-caption font-mono uppercase tracking-wider text-fg-muted flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" aria-hidden />
        {label}
      </p>
      <div className="text-xs font-semibold text-fg break-words">{children}</div>
      {hint && <p className="text-label text-fg-muted" title={hint}>{hint}</p>}
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = { OWNER: 'Owner', ADMIN: 'Admin', MEMBER: 'Member' };

/** Only facts the backend reports. No score, no estimate: an empty value says so. */
export function SecurityOverview({ data, loading, error }: { data: SecurityOverviewData | null; loading: boolean; error: string | null }) {
  return (
    <SectionCard icon={ShieldCheck} title="Security overview" description="The current state of your account's sign-in protection.">
      {error && !data && (
        <InlineAlert variant="error" title="Could not load your security overview">
          {error}
        </InlineAlert>
      )}
      {loading && !data && !error && <p role="status" className="text-xs text-fg-secondary">Loading…</p>}

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Fact icon={UserRound} label="Account" hint={data.organization ?? undefined}>
            <span className="block truncate" title={data.email}>{data.email}</span>
            <span className="inline-block mt-1"><Badge>{ROLE_LABELS[data.role] ?? data.role}</Badge></span>
          </Fact>

          <Fact
            icon={KeyRound}
            label="Password"
            hint={data.password.changedAt ? `Changed ${formatDateTime(data.password.changedAt)}` : 'No change recorded yet'}
          >
            <Badge tone="success">Protected</Badge>
          </Fact>

          <Fact
            icon={MonitorSmartphone}
            label="Active sessions"
            hint={data.sessions.currentStartedAt ? `This device since ${formatDateTime(data.sessions.currentStartedAt)}` : 'This session starts being tracked at its next refresh'}
          >
            {data.sessions.active}
          </Fact>

          <Fact icon={ShieldAlert} label="Two-factor authentication">
            <Badge>Not available</Badge>
          </Fact>

          <div className="sm:col-span-2 lg:col-span-4">
            <Fact icon={Activity} label="Last failed sign-in" hint={data.lastFailedSignInAt ? utcLabel(data.lastFailedSignInAt) : undefined}>
              {data.lastFailedSignInAt ? formatDateTime(data.lastFailedSignInAt) : 'None recorded'}
            </Fact>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
