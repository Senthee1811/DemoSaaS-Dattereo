'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck, ArrowRight, Lock, Mail, User, Building, AlertCircle, Loader2, Sparkles, CheckCircle2 } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password || !orgName) {
      setErrorMessage('Please fill out all required fields.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          orgName,
          orgSlug: orgName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-'),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error?.message || 'Registration failed.');
      }

      // Store auth session
      if (typeof window !== 'undefined') {
        localStorage.setItem('spendguard_token', data.accessToken);
        localStorage.setItem('spendguard_refresh_token', data.refreshToken);
        localStorage.setItem('spendguard_user', JSON.stringify(data.user));
      }

      // Route to guided onboarding wizard
      router.push('/onboarding');
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred during registration.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF9F6] flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Brand Logo */}
        <Link href="/" className="inline-flex items-center gap-2.5 group">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#FF6B35] to-[#FF8A4C] flex items-center justify-center shadow-lg shadow-[#FF6B35]/25 group-hover:scale-105 transition-transform">
            <ShieldCheck className="w-5 h-5 text-white stroke-[2.5]" />
          </div>
          <span className="text-2xl font-black tracking-tight text-[#111111]">
            Spend<span className="text-[#FF6B35]">Guard</span> <span className="text-xs px-2 py-0.5 rounded-md bg-[#FFF1EA] text-[#FF6B35] font-bold border border-[#FFD9C7] ml-1">AI</span>
          </span>
        </Link>

        <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFF1EA] border border-[#FFD9C7] text-xs font-bold text-[#FF6B35]">
          <Sparkles className="w-3.5 h-3.5" />
          <span>14-Day Free Enterprise Trial</span>
        </div>

        <h2 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight text-[#111111]">
          Create your organization
        </h2>
        <p className="mt-2 text-sm text-[#666666]">
          Stop runaway model costs with real-time budget guardrails.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:rounded-3xl sm:px-10 border border-[#E8E8E8]">
          {errorMessage && (
            <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs sm:text-sm text-red-800 font-medium leading-relaxed">
                {errorMessage}
              </p>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-bold text-[#111111] uppercase tracking-wider mb-1.5">
                Full Name
              </label>
              <div className="relative rounded-2xl">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#999999]">
                  <User className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Elena Rostova"
                  className="block w-full pl-10 pr-4 py-2.5 rounded-2xl border border-[#E8E8E8] bg-white text-sm text-[#111111] placeholder-[#AAAAAA] focus:outline-none focus:ring-2 focus:ring-[#FF6B35] focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#111111] uppercase tracking-wider mb-1.5">
                Work Email
              </label>
              <div className="relative rounded-2xl">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#999999]">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="elena@company.com"
                  className="block w-full pl-10 pr-4 py-2.5 rounded-2xl border border-[#E8E8E8] bg-white text-sm text-[#111111] placeholder-[#AAAAAA] focus:outline-none focus:ring-2 focus:ring-[#FF6B35] focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#111111] uppercase tracking-wider mb-1.5">
                Organization Name
              </label>
              <div className="relative rounded-2xl">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#999999]">
                  <Building className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  required
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Acme Innovations Inc."
                  className="block w-full pl-10 pr-4 py-2.5 rounded-2xl border border-[#E8E8E8] bg-white text-sm text-[#111111] placeholder-[#AAAAAA] focus:outline-none focus:ring-2 focus:ring-[#FF6B35] focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#111111] uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative rounded-2xl">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#999999]">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="•••••••••••• (min 8 chars)"
                  className="block w-full pl-10 pr-4 py-2.5 rounded-2xl border border-[#E8E8E8] bg-white text-sm text-[#111111] placeholder-[#AAAAAA] focus:outline-none focus:ring-2 focus:ring-[#FF6B35] focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] text-white font-bold text-sm shadow-md shadow-[#FF6B35]/25 hover:shadow-lg hover:shadow-[#FF6B35]/35 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creating workspace...</span>
                  </>
                ) : (
                  <>
                    <span>Continue to Onboarding</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Guarantees */}
          <div className="mt-6 pt-5 border-t border-[#F0ECE7] space-y-2">
            <div className="flex items-center gap-2 text-xs text-[#555555]">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Fail-closed protection on all upstream inference calls</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#555555]">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Zero plaintext provider keys stored (AES-256-GCM vault)</span>
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-sm text-[#666666]">
          Already registered?{' '}
          <Link href="/login" className="font-bold text-[#FF6B35] hover:underline">
            Sign in to existing workspace
          </Link>
        </p>
      </div>
    </div>
  );
}
