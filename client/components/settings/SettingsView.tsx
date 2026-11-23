'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  UserRound,
  ShieldCheck,
  BellRing,
  Settings2,
  UserRoundX,
  CircleCheck,
  TriangleAlert,
  CircleX,
  Eye,
  EyeOff,
  Compass,
  Users,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { authFetch, clearSession, readApiError } from '@/lib/auth-fetch';
import { useStoredUser } from '@/lib/client-storage';
import { errorMessage } from '@/lib/types';
import { SlackAlertSettings } from './SlackAlertSettings';
import { useEscapeToClose } from '@/components/ui/feedback';
import { Badge } from '@/components/ui/Badge';
import { SecurityWorkspace } from './security/SecurityWorkspace';
import { Tip } from '@/components/ui/tooltip';

interface AccountStatus {
  accountStatus?: 'ACTIVE' | 'DEACTIVATED';
  organization?: { memberCount?: number };
  ownershipConstraint?: { canDeactivate?: boolean; isSoleOwner?: boolean; reason?: string | null };
}

interface SettingsViewProps {
  /** Section to open first (e.g. from the account menu). */
  initialTab?: SettingsTab;
  onStartTour?: () => void;
  onNavigateToTeam?: () => void;
}

export type SettingsTab = 'profile' | 'security' | 'notifications' | 'preferences' | 'account';

export function SettingsView({ initialTab = 'account', onStartTour, onNavigateToTeam }: SettingsViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  // User & Org state
  const user = useStoredUser() ?? {};
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);

  // Deactivation Modal State
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);
  const [deactivateStep, setDeactivateStep] = useState<1 | 2 | 3>(1);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [reason, setReason] = useState('Downsizing AI operations');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);
  // Escape closes the deactivation dialog, except while the request is running
  useEscapeToClose(isDeactivateModalOpen && !isDeactivating, () => setIsDeactivateModalOpen(false));

  useEffect(() => {
    authFetch('/api/auth/account-status')
      .then((res) => (res.ok ? (res.json() as Promise<AccountStatus>) : null))
      .then((data) => {
        if (data) setAccountStatus(data);
      })
      .catch((err) => console.error('Failed to fetch account status:', err));
  }, []);

  const handleDeactivate = async () => {
    if (confirmPhrase !== 'DEACTIVATE') {
      setDeactivateError('Please type DEACTIVATE in capital letters to confirm.');
      return;
    }

    if (!password) {
      setDeactivateError('Password is required for identity confirmation.');
      return;
    }

    setIsDeactivating(true);
    setDeactivateError(null);

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('spendguard_token') : null;
      const res = await authFetch('/api/auth/deactivate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          password,
          reason,
          confirmPhrase,
        }),
      });

      if (!res.ok) {
        throw new Error(await readApiError(res, 'Deactivation failed.'));
      }

      // Purge client sessions
      clearSession();
      try {
        sessionStorage.clear();
      } catch {
        /* storage unavailable */
      }

      // Redirect to login with confirmation
      router.push('/login?deactivated=true');
    } catch (err: unknown) {
      setDeactivateError(errorMessage(err, 'Deactivation failed.'));
    } finally {
      setIsDeactivating(false);
    }
  };

  const canDeactivate = accountStatus?.ownershipConstraint?.canDeactivate !== false;
  const ownershipReason = accountStatus?.ownershipConstraint?.reason;

  return (
    <div className="space-y-6 max-w-6xl pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-line pb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-subtle border border-line text-caption font-mono font-medium text-fg-secondary mb-1.5">
            <Settings2 className="w-3 h-3 text-accent" />
            <span>Workspace & Identity Governance</span>
          </div>
          <h1 className="font-serif text-2xl font-normal text-fg tracking-tight">
            Settings & Account Management
          </h1>
          <p className="text-xs text-fg-secondary mt-0.5">
            Manage your personal profile, security authentication, notification webhooks, and account lifecycle.
          </p>
        </div>

        {onStartTour && (
          <button
            type="button"
            onClick={onStartTour}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-surface hover:bg-surface-subtle border border-line text-xs font-semibold text-fg shadow-2xs transition-colors self-start sm:self-auto"
          >
            <Compass className="w-3.5 h-3.5 text-accent" />
            <span>Restart Product Tour</span>
          </button>
        )}
      </div>

      {/* Settings Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-line overflow-x-auto pb-px">
        {[
          { id: 'account', label: 'Account Management', icon: UserRoundX },
          { id: 'profile', label: 'Profile', icon: UserRound },
          { id: 'security', label: 'Security & Auth', icon: ShieldCheck },
          { id: 'notifications', label: 'Notifications', icon: BellRing },
          { id: 'preferences', label: 'Preferences', icon: Settings2 },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as SettingsTab)}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-accent text-accent font-semibold'
                  : 'border-transparent text-fg-secondary hover:text-fg hover:border-line'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: ACCOUNT MANAGEMENT (Primary Focus) */}
      {activeTab === 'account' && (
        <div className="space-y-6">
          {/* Identity & Membership Overview */}
          <div className="p-6 rounded-card bg-surface border border-line shadow-2xs space-y-5">
            <div>
              <h2 className="font-serif text-lg font-normal text-fg tracking-tight">
                Account Status & Membership
              </h2>
              <p className="text-xs text-fg-secondary">
                Overview of your authenticated identity, tenant organization, and active privileges.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-field bg-surface-subtle border border-line-strong space-y-1">
                <span className="text-caption font-mono font-semibold uppercase tracking-wider text-fg-muted block">
                  Account Email
                </span>
                <p className="text-xs font-semibold text-fg truncate font-mono">
                  {user.email || '—'}
                </p>
                <span className="inline-flex items-center gap-1 text-caption text-success font-medium mt-1">
                  <CircleCheck className="w-3 h-3" />
                  <span>Signed in</span>
                </span>
              </div>

              <div className="p-4 rounded-field bg-surface-subtle border border-line-strong space-y-1">
                <span className="text-caption font-mono font-semibold uppercase tracking-wider text-fg-muted block">
                  Account Status
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-semibold text-fg">Active & Authenticated</span>
                </div>
                <p className="text-caption text-fg-muted">This session is active</p>
              </div>

              <div className="p-4 rounded-field bg-surface-subtle border border-line-strong space-y-1">
                <span className="text-caption font-mono font-semibold uppercase tracking-wider text-fg-muted block">
                  Workspace Membership
                </span>
                <p className="text-xs font-semibold text-fg truncate" title={user.orgName || 'Workspace'}>
                  {user.orgName || 'Workspace'}
                </p>
                <div className="flex items-center gap-1.5 text-caption text-fg-secondary">
                  <Badge tone="accent" mono>{user.role || 'MEMBER'}</Badge>
                  <span>{accountStatus?.organization?.memberCount || 1} members</span>
                </div>
              </div>
            </div>
          </div>

          {/* DANGER ZONE: ACCOUNT DEACTIVATION */}
          <div className="p-6 rounded-card bg-critical-bg/40 border border-critical-border/80 shadow-2xs space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-field bg-critical-bg text-critical flex items-center justify-center shrink-0">
                <UserRoundX className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-serif text-base font-normal text-fg">
                    Deactivate User Account
                  </h3>
                  <Badge tone="critical" mono>Irreversible Session Revocation</Badge>
                </div>
                <p className="text-xs text-fg-secondary leading-relaxed max-w-3xl">
                  Deactivating your account permanently invalidates all active JWT sessions and refresh tokens.
                  Your access to SpendGuard AI will be revoked immediately. Organization data, provider keys, 
                  audit records, and other team members&apos; access remain intact.
                </p>
              </div>
            </div>

            {/* Ownership Warning Banner if applicable */}
            {!canDeactivate && (
              <div className="p-4 rounded-field bg-warning-bg border border-warning-border flex items-start gap-3">
                <TriangleAlert className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-warning">
                    Ownership Transfer Required Before Deactivation
                  </p>
                  <p className="text-xs text-warning leading-relaxed">
                    {ownershipReason || 'As the sole OWNER of this workspace, you must transfer ownership to another team member before deactivating your account to prevent leaving the workspace unmanaged.'}
                  </p>
                  {onNavigateToTeam && (
                    <button
                      type="button"
                      onClick={onNavigateToTeam}
                      className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-warning hover:text-amber-950 underline"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Go to Team & Access to assign an Owner</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="pt-2 flex items-center justify-between border-t border-critical-border/60">
              <span className="text-xs text-fg-muted">
                Requires current password verification & confirmation phrase.
              </span>

              <button
                type="button"
                onClick={() => {
                  setDeactivateStep(1);
                  setDeactivateError(null);
                  setPassword('');
                  setConfirmPhrase('');
                  setIsDeactivateModalOpen(true);
                }}
                disabled={!canDeactivate}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-colors shadow-2xs ${
                  canDeactivate
                    ? 'bg-red-600 hover:bg-red-700 text-white cursor-pointer'
                    : 'bg-red-200 text-red-400 cursor-not-allowed'
                }`}
              >
                <UserRoundX className="w-3.5 h-3.5" />
                <span>Deactivate Account...</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PROFILE */}
      {activeTab === 'profile' && (
        <div className="p-6 rounded-card bg-surface border border-line shadow-2xs space-y-5">
          <div>
            <h2 className="font-serif text-lg font-normal text-fg tracking-tight">
              Personal Profile
            </h2>
            <p className="text-xs text-fg-secondary">
              Identity details displayed to your FinOps team and in cryptographic audit trails.
            </p>
          </div>

          <div className="space-y-4 max-w-xl">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-fg">Full Name</label>
              <input
                type="text"
                readOnly
                value={user.name || ''}
                className="w-full px-3.5 py-2 rounded-field bg-surface-subtle border border-line text-xs text-fg focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-fg">Email Address</label>
              <input
                type="email"
                readOnly
                value={user.email || ''}
                className="w-full px-3.5 py-2 rounded-field bg-surface-subtle border border-line text-xs text-fg font-mono focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-fg">Assigned Role</label>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-subtle border border-line text-xs font-medium text-fg">
                <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                <span>{user.role || 'MEMBER'} ({user.role === 'OWNER' ? 'Full FinOps Governance & Key Access' : user.role === 'ADMIN' ? 'Project, Key & Team Management' : 'Read-only Dashboard Access'})</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SECURITY & AUTH. Account sign-in security only: provider-credential protection lives in Key Vault */}
      {activeTab === 'security' && <SecurityWorkspace />}

      {/* TAB 4: NOTIFICATIONS */}
      {activeTab === 'notifications' && (
        <div className="p-6 rounded-card bg-surface border border-line shadow-2xs space-y-5">
          <div>
            <h2 className="font-serif text-lg font-normal text-fg tracking-tight">
              Notifications & Alerts
            </h2>
            <p className="text-xs text-fg-secondary">
              Budget warnings, hard blocks and cost spikes always appear in the in-app Alerts feed.
              Add a Slack webhook to also post them to a channel.
            </p>
          </div>

          <div className="space-y-3 max-w-xl">
            <SlackAlertSettings />

            <div className="p-4 rounded-field bg-surface-subtle border border-line-strong flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-fg">Email Dispatch</p>
                <p className="text-label text-fg-muted">Email budget warnings and hard-block notifications</p>
              </div>
              <span className="text-label text-fg-muted font-semibold">Not configured — coming soon</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: PREFERENCES */}
      {activeTab === 'preferences' && (
        <div className="p-6 rounded-card bg-surface border border-line shadow-2xs space-y-5">
          <div>
            <h2 className="font-serif text-lg font-normal text-fg tracking-tight">
              Interface Preferences
            </h2>
            <p className="text-xs text-fg-secondary">
              Customizations for currency, timezones, and display styling.
            </p>
          </div>

          <div className="space-y-4 max-w-xl text-xs">
            <div className="p-4 rounded-field bg-surface-subtle border border-line-strong space-y-1">
              <label className="font-semibold text-fg">Currency Display</label>
              <p className="text-fg-muted text-label">USD ($) - Standard FinOps multi-provider denomination</p>
            </div>

            <div className="p-4 rounded-field bg-surface-subtle border border-line-strong space-y-1">
              <label className="font-semibold text-fg">Design Direction</label>
              <p className="text-fg-muted text-label">Editorial Dattreo Design System (Deep neutrals, orange accents, zero slop)</p>
            </div>
          </div>
        </div>
      )}

      {/* MULTI-STEP ACCOUNT DEACTIVATION MODAL */}
      {isDeactivateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div 
            className="relative w-full max-w-xl bg-surface rounded-card border border-critical-border shadow-2xl p-6 sm:p-8 space-y-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="deactivate-modal-title"
          >
            {/* Header with Step Tracker */}
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-critical-bg text-critical flex items-center justify-center">
                  <UserRoundX className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="deactivate-modal-title" className="font-serif text-base font-normal text-fg">
                    Account Deactivation
                  </h3>
                  <span className="text-caption font-mono text-fg-muted">
                    Step {deactivateStep} of 3 • Security Verification
                  </span>
                </div>
              </div>

              <Tip label="Close modal">
                <button
                type="button"
                onClick={() => setIsDeactivateModalOpen(false)}
                className="p-1 rounded-full text-fg-muted hover:text-fg hover:bg-surface-muted transition-colors"
                aria-label="Close modal"
              >
                <CircleX className="w-4 h-4" />
              </button>
              </Tip>
            </div>

            {/* Error Message */}
            {deactivateError && (
              <div className="p-3.5 rounded-field bg-critical-bg border border-critical-border text-xs text-critical flex items-start gap-2">
                <TriangleAlert className="w-4 h-4 text-critical shrink-0 mt-0.5" />
                <span>{deactivateError}</span>
              </div>
            )}

            {/* STEP 1: EXPLAIN THE CONSEQUENCES */}
            {deactivateStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-fg">
                    Please review what happens when you deactivate your account:
                  </h4>
                  <p className="text-xs text-fg-secondary">
                    Deactivation is a security operation that disconnects your identity from SpendGuard AI.
                  </p>
                </div>

                <div className="p-4 rounded-field bg-surface-subtle border border-line-strong space-y-2.5 text-xs text-fg-secondary">
                  <div className="flex items-start gap-2.5">
                    <CircleCheck className="w-4 h-4 text-success shrink-0 mt-0.5" />
                    <span><strong>Immediate Session Invalidation:</strong> All active sessions, cookies, and refresh tokens are wiped from Redis instantly.</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CircleCheck className="w-4 h-4 text-success shrink-0 mt-0.5" />
                    <span><strong>Organization & Team Unaffected:</strong> Organization workspace, projects, budgets, and other members are NOT deleted.</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CircleCheck className="w-4 h-4 text-success shrink-0 mt-0.5" />
                    <span><strong>Billing Stays with Workspace:</strong> Subscriptions remain attached to the organization until canceled by an admin.</span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <CircleCheck className="w-4 h-4 text-success shrink-0 mt-0.5" />
                    <span><strong>30-Day Recovery Period:</strong> You may request reactivation within 30 days by contacting your workspace owner or support.</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setIsDeactivateModalOpen(false)}
                    className="text-xs text-fg-muted hover:text-fg font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeactivateStep(2)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-code hover:bg-[#2A2A28] text-white text-xs font-semibold shadow-2xs transition-colors"
                  >
                    <span>I Understand, Continue</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: SECURITY CONFIRMATION (PASSWORD CHALLENGE) */}
            {deactivateStep === 2 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-fg">
                    Step 2: Confirm Your Identity
                  </h4>
                  <p className="text-xs text-fg-secondary">
                    Enter your current SpendGuard password to verify this action.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-fg">
                      Current Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your current password"
                        className="w-full px-3.5 py-2.5 rounded-field bg-surface-subtle border border-line text-xs text-fg placeholder-fg-muted focus:bg-surface focus:border-accent focus:outline-none pr-10"
                      />
                      <Tip label={showPassword ? 'Hide password' : 'Show password'}>
                        <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      </Tip>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-fg">
                      Reason for Leaving (Optional)
                    </label>
                    <select
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-field bg-surface-subtle border border-line text-xs text-fg focus:bg-surface focus:outline-none cursor-pointer"
                    >
                      <option value="Downsizing AI operations">Downsizing AI operations</option>
                      <option value="Switching to self-hosted gateway">Switching to self-hosted gateway</option>
                      <option value="Transferring to another workspace">Transferring to another workspace</option>
                      <option value="Temporary pause in LLM testing">Temporary pause in LLM testing</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setDeactivateStep(1)}
                    className="text-xs text-fg-muted hover:text-fg font-medium"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!password) {
                        setDeactivateError('Please enter your password.');
                        return;
                      }
                      setDeactivateError(null);
                      setDeactivateStep(3);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-code hover:bg-[#2A2A28] text-white text-xs font-semibold shadow-2xs transition-colors"
                  >
                    <span>Proceed to Final Confirmation</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: FINAL CONFIRMATION (TYPE PHRASE) */}
            {deactivateStep === 3 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-critical">
                    Step 3: Final Confirmation
                  </h4>
                  <p className="text-xs text-fg-secondary">
                    To confirm deactivation, please type <strong className="text-critical font-mono">DEACTIVATE</strong> in the box below.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={confirmPhrase}
                    onChange={(e) => setConfirmPhrase(e.target.value)}
                    placeholder="Type DEACTIVATE"
                    className="w-full px-3.5 py-2.5 rounded-field bg-surface border border-red-300 text-xs font-mono text-fg placeholder-fg-muted focus:border-red-600 focus:outline-none"
                  />
                  <p className="text-label text-fg-muted">
                    Clicking the button below will immediately revoke your account and sign you out.
                  </p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setDeactivateStep(2)}
                    className="text-xs text-fg-muted hover:text-fg font-medium"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleDeactivate}
                    disabled={isDeactivating || confirmPhrase !== 'DEACTIVATE'}
                    className={`inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-semibold text-white shadow-2xs transition-colors ${
                      confirmPhrase === 'DEACTIVATE' && !isDeactivating
                        ? 'bg-red-600 hover:bg-red-700 cursor-pointer'
                        : 'bg-red-300 cursor-not-allowed'
                    }`}
                  >
                    {isDeactivating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Deactivating...</span>
                      </>
                    ) : (
                      <>
                        <UserRoundX className="w-3.5 h-3.5" />
                        <span>Deactivate my account</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

