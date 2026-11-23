'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserPlus,
  X,
  Building2,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { authFetch, readApiError } from '@/lib/auth-fetch';
import { useStoredUser } from '@/lib/client-storage';
import { useEscapeToClose } from '@/components/ui/feedback';

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  avatar_url?: string;
  created_at: string;
}

export function TeamView() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  useEscapeToClose(showInviteModal, () => setShowInviteModal(false));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const orgName = useStoredUser()?.orgName || 'My Organization';
  const [inviteError, setInviteError] = useState('');
  const [inviteNotice, setInviteNotice] = useState<{ email: string; emailSent: boolean } | null>(null);

  const fetchTeam = useCallback(
    () =>
      authFetch('/api/v1/team')
        .then((res) => (res.ok ? (res.json() as Promise<{ users?: UserItem[] }>) : null))
        .then((data) => {
          if (data) setUsers(data.users || []);
        })
        .catch((err) => console.error('Failed to fetch team:', err)),
    [],
  );

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  const handleInvite = async () => {
    if (!name || !email) return;
    setIsSubmitting(true);
    setInviteError('');
    try {
      const res = await authFetch('/api/v1/team', {
        method: 'POST',
        body: JSON.stringify({ name, email, role })
      });
      if (!res.ok) {
        setInviteError(await readApiError(res, 'Could not invite this member.'));
        return;
      }
      const data = await res.json();
      setInviteNotice({
        email: data?.user?.email || email,
        emailSent: data?.invite?.emailConfigured === true,
      });
      setShowInviteModal(false);
      setName('');
      setEmail('');
      fetchTeam();
    } catch (err) {
      console.error('Failed to invite team member:', err);
      setInviteError('Could not reach the server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {inviteNotice && (
        <div role="status" className="p-3.5 rounded-field border border-sg-border bg-surface text-xs space-y-1.5">
          <div className="flex items-start justify-between gap-3">
            <p className="font-semibold text-fg">{inviteNotice.email} was added to {orgName}.</p>
            <button type="button" onClick={() => setInviteNotice(null)} aria-label="Dismiss" className="text-sg-text-secondary hover:text-fg">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {inviteNotice.emailSent ? (
            <p className="text-sg-text-secondary">We emailed them a one-time link to set their password (valid 7 days).</p>
          ) : (
            <p className="text-sg-text-secondary">Email delivery isn&apos;t configured on this deployment, so no email was sent. They can set a password with &ldquo;Forgot password&rdquo; on the sign-in page once it is.</p>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl font-normal text-fg tracking-tight">
            Team & Role-Based Access Control
          </h2>
          <p className="text-xs text-sg-text-secondary mt-1">
            Manage organization members, assign FinOps administrator privileges, and scope project permissions.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowInviteModal(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent hover:bg-accent-hover text-white font-semibold text-xs shadow-2xs transition-colors self-start sm:self-auto"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Invite Member</span>
        </button>
      </div>

      {/* Team Members Table */}
      <div className="bg-surface rounded-card border border-sg-border shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-sg-border flex items-center justify-between">
          <h3 className="font-serif text-lg font-normal text-fg">
            Organization Members ({users.length})
          </h3>
          <span className="text-xs text-sg-text-secondary font-medium flex items-center gap-1.5 bg-parchment-ivory px-3 py-1 rounded-full border border-sg-border">
            <Building2 className="w-3.5 h-3.5" />
            {orgName}
          </span>
        </div>

        {users.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={Users}
              title="No team members loaded"
              description="Invite colleagues to collaborate on AI FinOps budgets and governance."
              compact
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-parchment-ivory text-sg-text-secondary font-semibold border-b border-sg-border">
                <tr>
                  <th className="py-3 px-4 font-mono text-label uppercase tracking-wider">Member</th>
                  <th className="py-3 px-4 font-mono text-label uppercase tracking-wider">Email</th>
                  <th className="py-3 px-4 font-mono text-label uppercase tracking-wider">Role</th>
                  <th className="py-3 px-4 font-mono text-label uppercase tracking-wider">Organization Scope</th>
                  <th className="py-3 px-4 font-mono text-label uppercase tracking-wider text-right">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sg-border text-fg">
                {users.map((u) => {
                  const initials = u.name
                    ? u.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
                    : 'U';

                  return (
                    <tr key={u.id} className="hover:bg-parchment-ivory transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-parchment-ivory border border-sg-border flex items-center justify-center font-bold text-xs text-fg">
                            {initials}
                          </div>
                          <span className="font-semibold text-xs text-fg">{u.name}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-label text-sg-text-secondary">{u.email}</td>

                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-caption font-semibold ${
                          u.role === 'OWNER'
                            ? 'bg-sg-success-bg text-success border border-sg-success-border'
                            : u.role === 'ADMIN'
                            ? 'bg-info-bg text-sg-chart-secondary border border-info-border'
                            : 'bg-surface-muted text-sg-text-secondary border border-sg-border'
                        }`}>
                          {u.role}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-sg-text-secondary">{orgName}</td>

                      <td className="py-3.5 px-4 text-right text-sg-text-muted text-label">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'Active'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Invite Member */}
      {showInviteModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 bg-overlay backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-card p-6 max-w-md w-full border border-sg-border shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-sg-border">
              <h3 className="font-serif text-lg font-normal text-fg">Invite Organization Member</h3>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="p-1.5 text-sg-text-muted hover:text-fg rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-fg block mb-1.5">Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Alex Rivera"
                  value={name}
                  maxLength={120}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-field border border-sg-border text-xs text-fg focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="font-semibold text-fg block mb-1.5">Email Address *</label>
                <input
                  type="email"
                  placeholder="alex.rivera@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-field border border-sg-border text-xs text-fg focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="font-semibold text-fg block mb-1.5">Access Role *</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'ADMIN' | 'MEMBER')}
                  className="w-full px-3.5 py-2.5 rounded-field border border-sg-border text-xs text-fg bg-parchment-ivory focus:outline-none focus:border-accent"
                >
                  <option value="MEMBER">Member — Read-only analytics & self-service tokens</option>
                  <option value="ADMIN">FinOps Admin — Configure project budgets & key vault</option>
                </select>
              </div>
            </div>

            {inviteError && (
              <p role="alert" className="text-xs text-critical bg-sg-critical-bg border border-sg-critical-border rounded-menu p-2.5">
                {inviteError}
              </p>
            )}

            <div className="pt-3 border-t border-sg-border flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => { setShowInviteModal(false); setInviteError(''); }}
                className="px-4 py-2 rounded-full text-xs font-semibold text-sg-text-secondary hover:bg-surface-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleInvite}
                disabled={isSubmitting || !name || !email}
                className="px-5 py-2 rounded-full text-xs font-semibold text-white bg-accent hover:bg-accent-hover disabled:opacity-50 transition-colors shadow-2xs"
              >
                {isSubmitting ? 'Sending Invite...' : 'Send Invitation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
