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
      const token = typeof window !== 'undefined' ? localStorage.getItem('spendguard_token') : null;
      const res = await fetch('/api/v1/team', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
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
      const token = typeof window !== 'undefined' ? localStorage.getItem('spendguard_token') : null;
      const res = await fetch('/api/v1/team', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
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
    <div className="space-y-5 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#18191B] tracking-tight">
            Team & Role-Based Access Control
          </h2>
          <p className="text-xs text-[#5F6368]">
            Manage organization members, assign FinOps administrator privileges, and scope project permissions.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowInviteModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#FF6B35] hover:bg-[#E85520] text-white font-semibold text-xs shadow-xs transition-colors self-start sm:self-auto"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Invite Member</span>
        </button>
      </div>

      {/* Team Members Table */}
      <div className="bg-white rounded-xl border border-[#E4E4E0] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[#E4E4E0] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#18191B]">
            Organization Members ({users.length})
          </h3>
          <span className="text-xs text-[#5F6368] font-medium flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5" />
            {orgName}
          </span>
        </div>

        {users.length === 0 ? (
          <div className="p-6">
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
              <thead className="bg-[#F3F3F0] text-[#5F6368] font-semibold border-b border-[#E4E4E0]">
                <tr>
                  <th className="py-2.5 px-3.5">Member</th>
                  <th className="py-2.5 px-3.5">Email</th>
                  <th className="py-2.5 px-3.5">Role</th>
                  <th className="py-2.5 px-3.5">Organization Scope</th>
                  <th className="py-2.5 px-3.5 text-right">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E0] text-[#18191B]">
                {users.map((u) => {
                  const initials = u.name
                    ? u.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
                    : 'U';

                  return (
                    <tr key={u.id} className="hover:bg-[#FBFBFA] transition-colors">
                      <td className="py-2.5 px-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-[#F3F3F0] border border-[#E4E4E0] flex items-center justify-center font-bold text-xs text-[#18191B]">
                            {initials}
                          </div>
                          <span className="font-semibold text-xs text-[#18191B]">{u.name}</span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3.5 font-mono text-[11px] text-[#5F6368]">{u.email}</td>

                      <td className="py-2.5 px-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          u.role === 'OWNER'
                            ? 'bg-[#F0FDF4] text-[#0D9488] border border-[#BBF7D0]'
                            : u.role === 'ADMIN'
                            ? 'bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]'
                            : 'bg-[#F3F3F0] text-[#5F6368] border border-[#E4E4E0]'
                        }`}>
                          {u.role}
                        </span>
                      </td>

                      <td className="py-2.5 px-3.5 text-[#5F6368]">{orgName}</td>

                      <td className="py-2.5 px-3.5 text-right text-[#80868B] text-[11px]">
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
          <div className="bg-white rounded-xl p-5 max-w-md w-full border border-[#E4E4E0] shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#E4E4E0]">
              <h3 className="text-sm font-bold text-[#18191B]">Invite Organization Member</h3>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="p-1 text-[#80868B] hover:text-[#18191B] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-[#18191B] block mb-1">Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Alex Rivera"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-[#E4E4E0] text-xs text-[#18191B] focus:outline-none focus:border-[#FF6B35]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#18191B] block mb-1">Email Address *</label>
                <input
                  type="email"
                  placeholder="alex.rivera@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-[#E4E4E0] text-xs text-[#18191B] focus:outline-none focus:border-[#FF6B35]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#18191B] block mb-1">Access Role *</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-md border border-[#E4E4E0] text-xs text-[#18191B] bg-white focus:outline-none focus:border-[#FF6B35]"
                >
                  <option value="MEMBER">Member — Read-only analytics & self-service tokens</option>
                  <option value="ADMIN">FinOps Admin — Configure project budgets & key vault</option>
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-[#E4E4E0] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold text-[#5F6368] hover:bg-[#F3F3F0]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleInvite}
                disabled={isSubmitting || !name || !email}
                className="px-3.5 py-1.5 rounded-md text-xs font-semibold text-white bg-[#FF6B35] hover:bg-[#E85520] disabled:opacity-50 transition-colors"
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
