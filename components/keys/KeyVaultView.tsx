'use client';

import React, { useState, useEffect } from 'react';
import { 
  KeyRound, 
  ShieldCheck, 
  Plus, 
  Copy, 
  Check, 
  Trash2, 
  Lock, 
  Cpu, 
  Sparkles,
  ExternalLink,
  X,
  AlertCircle
} from 'lucide-react';

interface KeyVaultViewProps {
  projects: Array<{ id: string; name: string }>;
  selectedProjectId: string;
}

export function KeyVaultView({ projects, selectedProjectId }: KeyVaultViewProps) {
  const [activeTab, setActiveTab] = useState<'provider' | 'gateway'>('provider');
  const [providerKeys, setProviderKeys] = useState<any[]>([]);
  const [gatewayKeys, setGatewayKeys] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal State
  const [showAddProviderModal, setShowAddProviderModal] = useState(false);
  const [showAddGatewayModal, setShowAddGatewayModal] = useState(false);
  const [newlyGeneratedSecret, setNewlyGeneratedSecret] = useState<string | null>(null);

  // Form State
  const [modalProjectId, setModalProjectId] = useState(selectedProjectId || (projects[0]?.id || ''));
  const [provider, setProvider] = useState<'OPENAI' | 'CLAUDE' | 'GEMINI'>('OPENAI');
  const [keyName, setKeyName] = useState('');
  const [rawKey, setRawKey] = useState('');
  const [rateLimitRpm, setRateLimitRpm] = useState('600');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchKeys = async () => {
    setIsLoading(true);
    try {
      const url = selectedProjectId ? `/api/v1/keys?projectId=${selectedProjectId}` : '/api/v1/keys';
      const res = await fetch(url);
      const data = await res.json();
      setProviderKeys(data.providerKeys || []);
      setGatewayKeys(data.gatewayKeys || []);
    } catch (err) {
      console.error('Failed to fetch keys:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, [selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId) {
      setModalProjectId(selectedProjectId);
    } else if (projects.length > 0 && !modalProjectId) {
      setModalProjectId(projects[0].id);
    }
  }, [selectedProjectId, projects]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreateProviderKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawKey || !keyName || !modalProjectId) return;
    try {
      const res = await fetch('/api/v1/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'PROVIDER',
          projectId: modalProjectId,
          provider,
          keyName,
          rawKey
        })
      });
      if (res.ok) {
        setShowAddProviderModal(false);
        setKeyName('');
        setRawKey('');
        fetchKeys();
      }
    } catch (err) {
      console.error('Failed to add provider key:', err);
    }
  };

  const handleCreateGatewayToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName || !modalProjectId) return;
    try {
      const res = await fetch('/api/v1/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'GATEWAY',
          projectId: modalProjectId,
          keyName,
          rateLimitRpm: Number(rateLimitRpm)
        })
      });
      const data = await res.json();
      if (res.ok && data.tokenSecret) {
        setNewlyGeneratedSecret(data.tokenSecret);
        fetchKeys();
      }
    } catch (err) {
      console.error('Failed to generate gateway token:', err);
    }
  };

  const handleRevokeKey = async (id: string, type: 'PROVIDER' | 'GATEWAY') => {
    if (!confirm('Are you sure you want to revoke this key? Any application using this key will immediately fail.')) return;
    try {
      const res = await fetch(`/api/v1/keys?id=${id}&type=${type}`, { method: 'DELETE' });
      if (res.ok) {
        fetchKeys();
      }
    } catch (err) {
      console.error('Failed to revoke key:', err);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Key Vault & Gateway Credentials</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Zero-plaintext encrypted credentials for OpenAI, Gemini & Claude, and SpendGuard gateway tokens.
          </p>
        </div>

        {/* Action Button */}
        <div className="flex items-center space-x-2">
          {activeTab === 'provider' ? (
            <button
              onClick={() => setShowAddProviderModal(true)}
              className="flex items-center space-x-2 px-3.5 py-2 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-semibold text-xs rounded-lg shadow-sm shadow-cyan-500/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Connect Provider Key</span>
            </button>
          ) : (
            <button
              onClick={() => {
                setNewlyGeneratedSecret(null);
                setShowAddGatewayModal(true);
              }}
              className="flex items-center space-x-2 px-3.5 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-semibold text-xs rounded-lg shadow-sm shadow-indigo-500/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Create Gateway Token</span>
            </button>
          )}
        </div>
      </div>

      {/* Security Banner */}
      <div className="p-4 rounded-xl bg-slate-900/70 border border-cyan-500/30 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-cyan-500/15 text-cyan-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-white">Hardware-Grade Key Isolation (AES-256-GCM)</p>
            <p className="text-[11px] text-slate-400">
              Provider API keys are encrypted at rest with unique initialization vectors. Only ephemeral in-memory proxy execution is allowed.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('provider')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'provider'
              ? 'bg-slate-800 text-cyan-400 border border-slate-700'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          🔐 Upstream Provider Keys ({providerKeys.length})
        </button>
        <button
          onClick={() => setActiveTab('gateway')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'gateway'
              ? 'bg-slate-800 text-cyan-400 border border-slate-700'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          ⚡ SpendGuard Gateway Tokens ({gatewayKeys.length})
        </button>
      </div>

      {/* Provider Keys Tab */}
      {activeTab === 'provider' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {providerKeys.map((k) => (
              <div key={k.id} className="glass-card p-5 rounded-xl border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700">
                        {k.provider}
                      </span>
                      <h4 className="font-bold text-white text-sm mt-2">{k.keyName}</h4>
                      <p className="text-[11px] text-slate-400">{k.projectName}</p>
                    </div>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" title="Active" />
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 font-mono text-xs text-slate-300 flex items-center justify-between my-3">
                    <span className="truncate">{k.keyPrefix}••••••••••••</span>
                    <Lock className="w-3.5 h-3.5 text-cyan-400 shrink-0 ml-2" />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Last used: {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'Active in proxy'}</span>
                  <button
                    onClick={() => handleRevokeKey(k.id, 'PROVIDER')}
                    className="p-1.5 text-slate-500 hover:text-rose-400 transition-all rounded hover:bg-rose-950/30"
                    title="Revoke provider key"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gateway Tokens Tab */}
      {activeTab === 'gateway' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {gatewayKeys.map((k) => (
              <div key={k.id} className="glass-card p-5 rounded-xl border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        {k.rateLimitRpm} RPM Limit
                      </span>
                      <h4 className="font-bold text-white text-sm mt-2">{k.keyName}</h4>
                      <p className="text-[11px] text-slate-400">{k.projectName}</p>
                    </div>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" title="Active" />
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 font-mono text-xs text-slate-300 flex items-center justify-between my-3">
                    <span className="truncate">{k.keyPrefix}••••••••</span>
                    <button
                      onClick={() => handleCopy(k.keyPrefix, k.id)}
                      className="text-slate-400 hover:text-white ml-2"
                      title="Copy Key Prefix"
                    >
                      {copiedId === k.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Created: {new Date(k.createdAt).toLocaleDateString()}</span>
                  <button
                    onClick={() => handleRevokeKey(k.id, 'GATEWAY')}
                    className="p-1.5 text-slate-500 hover:text-rose-400 transition-all rounded hover:bg-rose-950/30"
                    title="Revoke gateway token"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Provider Key Modal */}
      {showAddProviderModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-md w-full p-6 rounded-2xl border border-slate-700 shadow-2xl relative">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white text-base">Connect Upstream Provider Key</h3>
              <button onClick={() => setShowAddProviderModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProviderKey} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Target Project</label>
                <select
                  value={modalProjectId}
                  onChange={(e) => setModalProjectId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id} className="bg-slate-900">
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">AI Provider</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['OPENAI', 'CLAUDE', 'GEMINI'] as const).map((prov) => (
                    <button
                      type="button"
                      key={prov}
                      onClick={() => setProvider(prov)}
                      className={`py-2 rounded-lg text-xs font-bold border transition-all ${
                        provider === prov
                          ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500'
                          : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      {prov}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Key Nickname</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Production OpenAI Cluster"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Provider Secret API Key</label>
                <input
                  type="password"
                  required
                  placeholder={provider === 'OPENAI' ? 'sk-proj-...' : provider === 'CLAUDE' ? 'sk-ant-...' : 'AIzaSy...'}
                  value={rawKey}
                  onChange={(e) => setRawKey(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Will be immediately encrypted using AES-256-GCM.
                </p>
              </div>

              <div className="pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAddProviderModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-all"
                >
                  Encrypt & Save Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Gateway Key Modal */}
      {showAddGatewayModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-md w-full p-6 rounded-2xl border border-slate-700 shadow-2xl relative">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white text-base">Create SpendGuard Gateway Token</h3>
              <button
                onClick={() => {
                  setShowAddGatewayModal(false);
                  setNewlyGeneratedSecret(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {newlyGeneratedSecret ? (
              <div className="space-y-4">
                <div className="p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300">
                  <p className="font-bold mb-1">✅ Gateway Token Generated!</p>
                  <p className="text-[11px]">
                    Make sure to copy your API key now. You won't be able to see it again!
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-white break-all flex items-center justify-between">
                  <span>{newlyGeneratedSecret}</span>
                  <button
                    onClick={() => handleCopy(newlyGeneratedSecret, 'new-token')}
                    className="p-1.5 ml-2 text-cyan-400 hover:text-cyan-300"
                  >
                    {copiedId === 'new-token' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <button
                  onClick={() => {
                    setShowAddGatewayModal(false);
                    setNewlyGeneratedSecret(null);
                  }}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateGatewayToken} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Target Project</label>
                  <select
                    value={modalProjectId}
                    onChange={(e) => setModalProjectId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id} className="bg-slate-900">
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Token Name / Client App</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Backend Microservice Node.js"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Rate Limit (Requests / Min)</label>
                  <input
                    type="number"
                    value={rateLimitRpm}
                    onChange={(e) => setRateLimitRpm(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="pt-3 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowAddGatewayModal(false)}
                    className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-all"
                  >
                    Generate Token
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
