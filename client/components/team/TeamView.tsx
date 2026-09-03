'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  ShieldAlert, 
  Mail, 
  Check, 
  X,
  Lock,
  Sparkles,
  Shield
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

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

  const fetchTeam = async () => {
    try {
      const res = await fetch('/api/v1/team');
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
    try {
      const res = await fetch('/api/v1/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role })
      });
      if (res.ok) {
        setShowInviteModal(false);
        setName('');
        setEmail('');
        fetchTeam();
      }
    } catch (err) {
      console.error('Failed to invite team member:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[#111111] tracking-tight">
            Team & Role-Based Access Control
          </h2>
          <p className="text-xs sm:text-sm text-[#666666] mt-0.5">
            Manage organization members, assign FinOps administrator privileges, and configure project permissions.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowInviteModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] text-white font-bold text-xs shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <UserPlus className="w-4 h-4" />
          <span>Invite Member</span>
        </button>
      </div>

      {/* Team Members List */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-[#E8E8E8] shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE7]">
          <h3 className="text-base font-bold text-[#111111]">
            Organization Members ({users.length})
          </h3>
          <span className="text-xs text-[#777777] font-medium">Apex Innovations Inc.</span>
        </div>

        {users.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No team members loaded"
            description="Invite teammates to assign project access and collaborate on spend guardrails."
            actionText="Invite Teammate"
            onAction={() => setShowInviteModal(true)}
            compact
          />
        ) : (
          <div className="divide-y divide-[#F2EFEA]">
            {users.map((user) => (
              <div key={user.id} className="py-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#FFF1EA] border border-[#FFD9C7] flex items-center justify-center font-bold text-xs text-[#FF6B35]">
                    {user.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </div>

                  <div>
                    <div className="font-bold text-xs sm:text-sm text-[#111111]">
                      {user.name}
                    </div>
                    <div className="text-[11px] text-[#777777] font-mono">
                      {user.email}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${
                      user.role === 'OWNER'
                        ? 'bg-[#111111] text-white'
                        : user.role === 'ADMIN'
                        ? 'bg-[#FFF1EA] text-[#FF6B35] border border-[#FFD9C7]'
                        : 'bg-[#F4F4F4] text-[#666666]'
                    }`}
                  >
                    {user.role}
                  </span>

                  <span className="text-[11px] text-[#999999] hidden sm:inline">
                    Joined {new Date(user.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Role Permission Matrix Card */}
      <div className="bg-[#FFF8F5] rounded-3xl p-6 sm:p-7 border border-[#FFE2D6] space-y-4">
        <h4 className="text-sm font-bold text-[#111111] flex items-center gap-2">
          <Shield className="w-4 h-4 text-[#FF6B35]" />
          <span>Role Permissions Breakdown</span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-[#555555]">
          <div className="bg-white p-4 rounded-2xl border border-[#E8E8E8]">
            <strong className="text-[#111111] block mb-1">Owner</strong>
            Full organization control, billing configuration, provider key management, emergency project freezes.
          </div>
          <div className="bg-white p-4 rounded-2xl border border-[#E8E8E8]">
            <strong className="text-[#111111] block mb-1">Admin (FinOps)</strong>
            Create and edit project budgets, trigger alert webhooks, manage scoped gateway tokens, export audit ledgers.
          </div>
          <div className="bg-white p-4 rounded-2xl border border-[#E8E8E8]">
            <strong className="text-[#111111] block mb-1">Member (Engineer)</strong>
            Access test bench playground, view scoped project analytics, execute requests through gateway proxy.
          </div>
        </div>
      </div>

      {/* Modal: Invite Team Member */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-[#E8E8E8] shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8E8E8]">
              <h3 className="text-lg font-bold text-[#111111]">
                Invite Organization Member
              </h3>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="p-1 text-[#888888] hover:text-[#111111] rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Alex Rivera"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#E8E8E8] text-xs font-medium text-[#111111] focus:outline-none focus:border-[#FF6B35]"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  placeholder="alex.rivera@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#E8E8E8] text-xs font-medium text-[#111111] focus:outline-none focus:border-[#FF6B35]"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block mb-1">
                  Role Assignment *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole('MEMBER')}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      role === 'MEMBER'
                        ? 'bg-[#FFF1EA] text-[#FF6B35] border-[#FF6B35]'
                        : 'bg-white text-[#666666] border-[#E8E8E8]'
                    }`}
                  >
                    Member (Developer)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('ADMIN')}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      role === 'ADMIN'
                        ? 'bg-[#FFF1EA] text-[#FF6B35] border-[#FF6B35]'
                        : 'bg-white text-[#666666] border-[#E8E8E8]'
                    }`}
                  >
                    Admin (FinOps)
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[#E8E8E8] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#666666] hover:bg-[#F5F5F5]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleInvite}
                disabled={isSubmitting || !name || !email}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? 'Inviting...' : 'Send Invitation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
