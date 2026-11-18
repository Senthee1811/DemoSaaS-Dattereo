'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  Shield, 
  Mail, 
  Check, 
  X,
  Lock,
  Building2
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { authFetch, readApiError } from '@/lib/auth-fetch';

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
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orgName, setOrgName] = useState('My Organization');
  const [inviteError, setInviteError] = useState('');
  const [inviteNotice, setInviteNotice] = useState<{ email: string; link: string | null } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('spendguard_user');
      if (stored) {
        try {
          const u = JSON.parse(stored);
          if (u.orgName) setOrgName(u.orgName);
        } catch {}
      }
    }
  }, []);

  const fetchTeam = async () => {
    try {
      const res = await authFetch('/api/v1/team');
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      console.error('Failed to fetch team:', err);
    }
  };

  useEffect(() => {
    fetchTeam();
  }, []);

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
      const inviteToken: string | undefined = data?.invite?.token;
      setInviteNotice({
        email: data?.user?.email || email,
        // Email delivery is not wired up yet; share this link with the invitee directly.
        link: inviteToken ? `${window.location.origin}/forgot-password?token=${inviteToken}` : null,
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
        <div role="status" className="p-3.5 rounded-2xl border border-sg-border bg-white text-xs space-y-1.5">
          <div className="flex items-start justify-between gap-3">
            <p className="font-semibold text-inversion-dark">{inviteNotice.email} was added to {orgName}.</p>
            <button type="button" onClick={() => setInviteNotice(null)} aria-label="Dismiss" className="text-sg-text-secondary hover:text-inversion-dark">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {inviteNotice.link ? (
            <>
              <p className="text-sg-text-secondary">Email delivery isn&apos;t configured yet. Send them this one-time link to set their password (valid 7 days):</p>
              <code className="block break-all bg-parchment-ivory border border-parchment-border rounded-lg p-2 font-mono text-[11px] select-all">{inviteNotice.link}</code>
            </>
          ) : (
            <p className="text-sg-text-secondary">They can set a password with &ldquo;Forgot password&rdquo; on the sign-in page.</p>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl font-normal text-[#141413] tracking-tight">
            Team & Role-Based Access Control
          </h2>
          <p className="text-xs text-[#5F6368] mt-1">
            Manage organization members, assign FinOps administrator privileges, and scope project permissions.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowInviteModal(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#FF6B35] hover:bg-[#E55A25] text-white font-semibold text-xs shadow-2xs transition-colors self-start sm:self-auto"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Invite Member</span>
        </button>
      </div>

      {/* Team Members Table */}
      <div className="bg-white rounded-[24px] border border-[#E4E4E0] shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-[#E4E4E0] flex items-center justify-between">
          <h3 className="font-serif text-lg font-normal text-[#141413]">
            Organization Members ({users.length})
          </h3>
          <span className="text-xs text-[#5F6368] font-medium flex items-center gap-1.5 bg-[#FAF8F5] px-3 py-1 rounded-full border border-[#E4E4E0]">
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
              <thead className="bg-[#FAF8F5] text-[#5F6368] font-semibold border-b border-[#E4E4E0]">
                <tr>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider">Member</th>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider">Email</th>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider">Role</th>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider">Organization Scope</th>
                  <th className="py-3 px-4 font-mono text-[11px] uppercase tracking-wider text-right">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E0] text-[#141413]">
                {users.map((u) => {
                  const initials = u.name
                    ? u.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
                    : 'U';

                  return (
                    <tr key={u.id} className="hover:bg-[#FAF8F5] transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#FAF8F5] border border-[#E4E4E0] flex items-center justify-center font-bold text-xs text-[#141413]">
                            {initials}
                          </div>
                          <span className="font-semibold text-xs text-[#141413]">{u.name}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px] text-[#5F6368]">{u.email}</td>

                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          u.role === 'OWNER'
                            ? 'bg-[#F0FDF4] text-[#0D9488] border border-[#BBF7D0]'
                            : u.role === 'ADMIN'
                            ? 'bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]'
                            : 'bg-[#F3F3F0] text-[#5F6368] border border-[#E4E4E0]'
                        }`}>
                          {u.role}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-[#5F6368]">{orgName}</td>

                      <td className="py-3.5 px-4 text-right text-[#80868B] text-[11px]">
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[24px] p-6 max-w-md w-full border border-[#E4E4E0] shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#E4E4E0]">
              <h3 className="font-serif text-lg font-normal text-[#141413]">Invite Organization Member</h3>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="p-1.5 text-[#80868B] hover:text-[#141413] rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-[#141413] block mb-1.5">Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Alex Rivera"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-[#E4E4E0] text-xs text-[#141413] focus:outline-none focus:border-[#FF6B35]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#141413] block mb-1.5">Email Address *</label>
                <input
                  type="email"
                  placeholder="alex.rivera@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-[#E4E4E0] text-xs text-[#141413] focus:outline-none focus:border-[#FF6B35]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#141413] block mb-1.5">Access Role *</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-[#E4E4E0] text-xs text-[#141413] bg-[#FAF8F5] focus:outline-none focus:border-[#FF6B35]"
                >
                  <option value="MEMBER">Member — Read-only analytics & self-service tokens</option>
                  <option value="ADMIN">FinOps Admin — Configure project budgets & key vault</option>
                </select>
              </div>
            </div>

            {inviteError && (
              <p role="alert" className="text-xs text-[#B91C1C] bg-sg-critical-bg border border-sg-critical-border rounded-xl p-2.5">
                {inviteError}
              </p>
            )}

            <div className="pt-3 border-t border-sg-border flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => { setShowInviteModal(false); setInviteError(''); }}
                className="px-4 py-2 rounded-full text-xs font-semibold text-[#5F6368] hover:bg-[#F3F3F0] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleInvite}
                disabled={isSubmitting || !name || !email}
                className="px-5 py-2 rounded-full text-xs font-semibold text-white bg-[#FF6B35] hover:bg-[#E55A25] disabled:opacity-50 transition-colors shadow-2xs"
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
