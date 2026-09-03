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
  Lock
} from 'lucide-react';

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

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
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
      console.error('Failed to invite user:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    try {
      await fetch('/api/v1/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, role: newRole })
      });
      fetchTeam();
    } catch (err) {
      console.error('Failed to update role:', err);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Organization & RBAC Permissions</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage team members, roles, project access tiers, and governance authority.
          </p>
        </div>

        <button
          onClick={() => setShowInviteModal(true)}
          className="flex items-center space-x-2 px-3.5 py-2 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-semibold text-xs rounded-lg shadow-sm shadow-cyan-500/20 transition-all self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>Invite Member</span>
        </button>
      </div>

      {/* Team Members List */}
      <div className="glass-card rounded-xl border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 bg-slate-900/60">
          <h3 className="font-bold text-white text-sm">Active Workspace Members ({users.length})</h3>
        </div>

        <div className="divide-y divide-slate-800">
          {users.map((u) => (
            <div key={u.id} className="p-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center space-x-3">
                <img
                  src={u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.name}`}
                  alt={u.name}
                  className="w-10 h-10 rounded-full border border-slate-700 object-cover"
                />
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-white text-xs">{u.name}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        u.role === 'OWNER'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : u.role === 'ADMIN'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {u.role}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{u.email}</p>
                </div>
              </div>

              <div className="flex items-center space-x-3 text-xs">
                {u.role === 'OWNER' ? (
                  <span className="text-slate-500 text-xs italic">Primary Account Holder</span>
                ) : (
                  <select
                    value={u.role}
                    onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    <option value="ADMIN">ADMIN</option>
                    <option value="MEMBER">MEMBER</option>
                  </select>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Role Permissions Matrix */}
      <div className="glass-card p-5 rounded-xl border border-slate-800">
        <h3 className="font-bold text-white text-sm mb-3">Role Permissions Matrix</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
              <tr>
                <th className="p-3">Capability</th>
                <th className="p-3 text-center">Owner</th>
                <th className="p-3 text-center">Admin</th>
                <th className="p-3 text-center">Member</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              <tr>
                <td className="p-3 font-semibold text-white">Create & Delete Projects</td>
                <td className="p-3 text-center text-emerald-400">✓</td>
                <td className="p-3 text-center text-emerald-400">✓</td>
                <td className="p-3 text-center text-slate-600">—</td>
              </tr>
              <tr>
                <td className="p-3 font-semibold text-white">Configure Budget Caps & Hard-Blocks</td>
                <td className="p-3 text-center text-emerald-400">✓</td>
                <td className="p-3 text-center text-emerald-400">✓</td>
                <td className="p-3 text-center text-slate-600">—</td>
              </tr>
              <tr>
                <td className="p-3 font-semibold text-white">Manage & Rotate Provider API Keys</td>
                <td className="p-3 text-center text-emerald-400">✓</td>
                <td className="p-3 text-center text-emerald-400">✓</td>
                <td className="p-3 text-center text-slate-600">—</td>
              </tr>
              <tr>
                <td className="p-3 font-semibold text-white">Execute Gateway Proxy Requests</td>
                <td className="p-3 text-center text-emerald-400">✓</td>
                <td className="p-3 text-center text-emerald-400">✓</td>
                <td className="p-3 text-center text-emerald-400">✓</td>
              </tr>
              <tr>
                <td className="p-3 font-semibold text-white">View & Export Immutable Audit Ledger</td>
                <td className="p-3 text-center text-emerald-400">✓</td>
                <td className="p-3 text-center text-emerald-400">✓</td>
                <td className="p-3 text-center text-emerald-400">✓</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-md w-full p-6 rounded-2xl border border-slate-700 shadow-2xl relative">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white text-base">Invite Team Member</h3>
              <button onClick={() => setShowInviteModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Elena Rostova"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Work Email</label>
                <input
                  type="email"
                  required
                  placeholder="elena.rostova@apexai.io"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Workspace Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="MEMBER">MEMBER (Read-only spend, execute API)</option>
                  <option value="ADMIN">ADMIN (Full budget, keys, and member control)</option>
                </select>
              </div>

              <div className="pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-all"
                >
                  {isSubmitting ? 'Sending Invite...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
