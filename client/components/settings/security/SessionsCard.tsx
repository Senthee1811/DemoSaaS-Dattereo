'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Laptop, LogOut, Smartphone } from 'lucide-react';
import { authFetch, clearSession, readApiError } from '@/lib/auth-fetch';
import { formatDateTime, utcLabel } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog, InlineAlert, useToast } from '@/components/ui/feedback';
import { SectionCard } from './SectionCard';
import type { SessionRow, SessionsData } from './types';

const isMobile = (device: string) => /iOS|Android/.test(device);

export function SessionsCard({ data, loading, error, onChanged }: { data: SessionsData | null; loading: boolean; error: string | null; onChanged: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [target, setTarget] = useState<SessionRow | null>(null);
  const [confirmOthers, setConfirmOthers] = useState(false);

  const sessions = data?.sessions ?? [];
  const others = sessions.filter((s) => !s.current);

  const revoke = async (session: SessionRow) => {
    const res = await authFetch(`/api/auth/sessions/${encodeURIComponent(session.id)}${session.current ? '?confirmCurrent=true' : ''}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await readApiError(res, 'That session could not be signed out.'));
    if (session.current) {
      // The server ended this very session: leave cleanly instead of waiting for the next 401
      clearSession();
      router.replace('/login?signedOut=1');
      return;
    }
    toast.success(`${session.device} was signed out`);
    onChanged();
  };

  const revokeOthers = async () => {
    const res = await authFetch('/api/auth/sessions/revoke-others', { method: 'POST' });
    if (!res.ok) throw new Error(await readApiError(res, 'Your other sessions could not be signed out.'));
    const { revoked } = (await res.json()) as { revoked?: number };
    toast.success(revoked ? `${revoked} other session${revoked === 1 ? '' : 's'} signed out` : 'No other sessions were signed in');
    onChanged();
  };

  return (
    <SectionCard
      icon={Laptop}
      title="Active sessions"
      description="Where your account is signed in right now."
      action={
        <button
          type="button"
          onClick={() => setConfirmOthers(true)}
          disabled={others.length === 0}
          className="shrink-0 px-3.5 py-2 rounded-full border border-line bg-surface text-xs font-semibold text-fg hover:bg-surface-muted disabled:opacity-50"
        >
          Sign out others
        </button>
      }
    >
      {error && !data && (
        <InlineAlert variant="error" title="Could not load your sessions">
          {error}
        </InlineAlert>
      )}
      {loading && !data && !error && <p role="status" className="text-xs text-fg-secondary">Loading…</p>}

      {data && data.currentSessionKnown === false && (
        <InlineAlert variant="info" title="This session is not tracked yet">
          You signed in before session tracking existed. It appears in this list after its next automatic refresh (within about 15 minutes).
        </InlineAlert>
      )}

      {data && sessions.length === 0 && data.currentSessionKnown && <p className="text-xs text-fg-secondary">No active sessions.</p>}

      {sessions.length > 0 && (
        <ul className="space-y-2.5">
          {sessions.map((s) => {
            const Icon = isMobile(s.device) ? Smartphone : Laptop;
            return (
              <li key={s.id} className="rounded-field border border-line bg-surface-subtle p-3.5 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <Icon className="w-4 h-4 text-fg-muted mt-0.5 shrink-0" aria-hidden />
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-xs font-semibold text-fg flex items-center gap-2 flex-wrap">
                      <span className="truncate" title={s.device}>{s.device}</span>
                      {s.current && <Badge tone="accent">This device</Badge>}
                    </p>
                    <p className="text-label text-fg-muted" title={`Signed in ${utcLabel(s.createdAt)}`}>
                      {s.ip ? `${s.ip} · ` : ''}Signed in {formatDateTime(s.createdAt)}
                    </p>
                    <p className="text-label text-fg-muted" title={`${utcLabel(s.lastUsedAt)} · expires ${utcLabel(s.expiresAt)}`}>
                      Last active {formatDateTime(s.lastUsedAt)} · expires {formatDateTime(s.expiresAt)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTarget(s)}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-line bg-surface text-label font-semibold text-critical hover:bg-critical-bg"
                  aria-label={s.current ? 'Sign out of this device' : `Sign out ${s.device}`}
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden />
                  <span>Sign out</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={target !== null}
        tone="sensitive"
        title={target?.current ? 'Sign out of this device?' : `Sign out ${target?.device ?? ''}?`}
        description={
          target?.current
            ? 'This is the session you are using right now. Signing it out ends your session here and takes you to the sign-in page.'
            : 'That device is signed out within moments and has to sign in again with the password.'
        }
        consequences={
          target?.current
            ? ['You will need to sign in again on this device.', 'Your other devices stay signed in.']
            : ['Anything open on that device stops working once it next talks to SpendGuard.', 'This device stays signed in.']
        }
        reversible="You can't undo this, but signing back in creates a new session at any time."
        confirmLabel={target?.current ? 'Sign out here' : 'Sign out device'}
        onConfirm={async () => {
          if (target) await revoke(target);
        }}
        onClose={() => setTarget(null)}
      />

      <ConfirmDialog
        open={confirmOthers}
        tone="sensitive"
        title="Sign out all other sessions?"
        description={`This signs out ${others.length} other session${others.length === 1 ? '' : 's'}. This device stays signed in.`}
        consequences={['Every other device has to sign in again with the password.', 'Use this if you lost a device or think someone else has access.']}
        reversible="You can't undo this, but signing back in creates a new session at any time."
        confirmLabel="Sign out others"
        onConfirm={revokeOthers}
        onClose={() => setConfirmOthers(false)}
      />
    </SectionCard>
  );
}
