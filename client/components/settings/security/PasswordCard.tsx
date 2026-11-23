'use client';

import React, { useState } from 'react';
import { Check, Circle, Eye, EyeOff, KeyRound, ShieldOff } from 'lucide-react';
import { authFetch } from '@/lib/auth-fetch';
import { errorMessage } from '@/lib/types';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/lib/limits';
import { formatDateTime, utcLabel } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { InlineAlert, Spinner, useToast } from '@/components/ui/feedback';
import { Tip } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SectionCard } from './SectionCard';
import type { SecurityOverviewData } from './types';

/** Reads the API's error code as well as its message (a wrong current password is a field error). */
async function readError(res: Response): Promise<{ message: string; code?: string }> {
  try {
    const data = await res.clone().json();
    return { message: data?.error?.message ?? data?.message ?? 'The password could not be changed.', code: data?.error?.code };
  } catch {
    return { message: 'The password could not be changed.' };
  }
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  error,
  hint,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  error?: string | null;
  hint?: string;
  disabled?: boolean;
}) {
  const [shown, setShown] = useState(false);
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-fg block">
        {label}
      </label>
      <div className={`flex items-stretch rounded-field border bg-surface focus-within:border-accent ${error ? 'border-critical' : 'border-line'}`}>
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          maxLength={PASSWORD_MAX_LENGTH}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="flex-1 min-w-0 px-3.5 py-2.5 bg-transparent text-xs text-fg font-mono focus:outline-none"
        />
        <Tip label={shown ? 'Hide password' : 'Show password'}>
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            aria-pressed={shown}
            className="px-3 text-fg-muted hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-r-field"
          >
            {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </Tip>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-label text-critical">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-label text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Requirement({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-2 text-label ${met ? 'text-success' : 'text-fg-muted'}`}>
      {met ? <Check className="w-3.5 h-3.5" aria-hidden /> : <Circle className="w-3.5 h-3.5" aria-hidden />}
      <span>{children}</span>
      <span className="sr-only">{met ? '(met)' : '(not met yet)'}</span>
    </li>
  );
}

function ChangePasswordDialog({ open, onOpenChange, onChanged }: { open: boolean; onOpenChange: (o: boolean) => void; onChanged: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const lengthOk = next.length >= PASSWORD_MIN_LENGTH && next.length <= PASSWORD_MAX_LENGTH;
  const differs = next.length > 0 && next !== current;
  const matches = confirm.length > 0 && confirm === next;
  const canSubmit = current.length > 0 && lengthOk && differs && matches && !busy;

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setCurrentError(null);
    setFormError(null);
  };

  const handleOpenChange = (o: boolean) => {
    if (busy) return; // never abandon a request that is running
    if (!o) reset();
    onOpenChange(o);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setCurrentError(null);
    setFormError(null);
    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (!res.ok) {
        const { message, code } = await readError(res);
        if (code === 'invalid_current_password') setCurrentError(message);
        else setFormError(message);
        return;
      }
      const data = (await res.json()) as { otherSessionsSignedOut?: number };
      const others = data.otherSessionsSignedOut ?? 0;
      toast.success('Password changed', others > 0 ? `${others} other session${others === 1 ? ' was' : 's were'} signed out.` : 'Your other sessions were not affected.');
      reset();
      onOpenChange(false);
      onChanged();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not reach the server. Your password was not changed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent hideClose={busy}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>Your other signed-in devices will be signed out. This device stays signed in.</DialogDescription>
          </DialogHeader>

          <PasswordField id="pw-current" label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" error={currentError} disabled={busy} />
          <PasswordField id="pw-new" label="New password" value={next} onChange={setNext} autoComplete="new-password" disabled={busy} />
          <PasswordField
            id="pw-confirm"
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            error={confirm.length > 0 && !matches ? 'The two new passwords do not match.' : null}
            disabled={busy}
          />

          <ul className="space-y-1" aria-label="Password requirements">
            <Requirement met={lengthOk}>
              {PASSWORD_MIN_LENGTH} to {PASSWORD_MAX_LENGTH} characters
            </Requirement>
            <Requirement met={differs}>Different from your current password</Requirement>
            <Requirement met={matches}>Confirmation matches</Requirement>
          </ul>

          {formError && (
            <InlineAlert variant="error" title="Password not changed">
              {formError}
            </InlineAlert>
          )}

          <DialogFooter>
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              disabled={busy}
              className="px-4 py-2 rounded-full border border-line bg-surface text-fg text-xs font-semibold hover:bg-surface-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              aria-busy={busy}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-accent hover:bg-accent-hover text-white text-xs font-semibold disabled:opacity-50"
            >
              {busy && <Spinner />}
              <span>{busy ? 'Changing…' : 'Change password'}</span>
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PasswordCard({ overview, onChanged }: { overview: SecurityOverviewData | null; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const changedAt = overview?.password.changedAt ?? null;

  return (
    <SectionCard icon={KeyRound} title="Authentication" description="How you sign in to this account.">
      <div className="rounded-field border border-line bg-surface-subtle p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-0.5 min-w-0">
          <p className="text-xs font-semibold text-fg flex items-center gap-2">
            Password <Badge tone="success">Set</Badge>
          </p>
          <p className="text-label text-fg-muted" title={utcLabel(changedAt)}>
            {overview === null ? 'Loading…' : changedAt ? `Last changed ${formatDateTime(changedAt)}` : 'No change recorded since the account was created.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-4 py-2 rounded-full bg-surface border border-line text-xs font-semibold text-fg hover:bg-surface-muted shadow-2xs"
        >
          Change password
        </button>
      </div>

      {/* Honest status: MFA is not implemented, so there is nothing to set up and no button to suggest otherwise */}
      <div className="rounded-field border border-line bg-surface-subtle p-4 flex items-start gap-3">
        <ShieldOff className="w-4 h-4 text-fg-muted mt-0.5 shrink-0" aria-hidden />
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-fg flex items-center gap-2">
            Two-factor authentication <Badge>Not available</Badge>
          </p>
          <p className="text-label text-fg-muted">SpendGuard does not support multi-factor authentication yet. Use a strong, unique password.</p>
        </div>
      </div>

      <ChangePasswordDialog open={open} onOpenChange={setOpen} onChanged={onChanged} />
    </SectionCard>
  );
}
