'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck, ArrowRight, Lock, Mail, AlertCircle, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error?.message || 'Invalid email or password.');
      }

      // Store auth session
      if (typeof window !== 'undefined') {
        localStorage.setItem('spendguard_token', data.accessToken);
        localStorage.setItem('spendguard_refresh_token', data.refreshToken);
        localStorage.setItem('spendguard_user', JSON.stringify(data.user));
      }

      router.push('/dashboard');
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBFBFA] flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Brand Logo */}
        <Link href="/" className="inline-flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-[#FF6B35] flex items-center justify-center text-white">
            <ShieldCheck className="w-5 h-5 text-white" strokeWidth={2.2} />
          </div>
          <span className="text-xl font-bold tracking-tight text-[#18191B]">
            SpendGuard <span className="text-[#FF6B35]">AI</span>
          </span>
        </Link>

        <h2 className="mt-6 text-2xl font-bold tracking-tight text-[#18191B]">
          Sign in to your FinOps workspace
        </h2>
        <p className="mt-1.5 text-xs text-[#5F6368]">
          Real-time AI spend governance, budget guardrails, and key vaults.
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-7 px-6 rounded-xl sm:px-8 border border-[#E4E4E0] shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          {errorMessage && (
            <div className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs text-red-800 font-medium leading-relaxed">
                {errorMessage}
              </p>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-[11px] font-mono font-medium text-[#18191B] uppercase tracking-wider mb-1.5">
                Work Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#737373]">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="sarah.chen@apexai.io"
                  className="block w-full pl-9 pr-3 py-2 rounded-md border border-[#E4E4E0] bg-white text-xs sm:text-sm text-[#18191B] placeholder-[#9E9E9E] focus:outline-none focus:ring-1 focus:ring-[#FF6B35] focus:border-[#FF6B35] transition-colors"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-mono font-medium text-[#18191B] uppercase tracking-wider">
                  Password
                </label>
                <a href="#" className="text-xs font-medium text-[#FF6B35] hover:underline">
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#737373]">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="block w-full pl-9 pr-3 py-2 rounded-md border border-[#E4E4E0] bg-white text-xs sm:text-sm text-[#18191B] placeholder-[#9E9E9E] focus:outline-none focus:ring-1 focus:ring-[#FF6B35] focus:border-[#FF6B35] transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-3.5 h-3.5 rounded border-[#D0D0D0] text-[#FF6B35] focus:ring-[#FF6B35]"
                />
                <span className="text-xs text-[#5F6368]">Keep me signed in</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-[#FF6B35] hover:bg-[#E55A25] text-white font-semibold text-xs sm:text-sm transition-colors disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign in to FinOps Console</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Seed credentials banner */}
          <div className="mt-6 pt-4 border-t border-[#E4E4E0] text-center">
            <span className="text-[11px] font-mono text-[#737373] block mb-1">
              DEMO CREDENTIALS:
            </span>
            <div className="inline-flex items-center gap-2 bg-[#F7F7F6] border border-[#E4E4E0] px-2.5 py-1 rounded text-[11px] font-mono text-[#18191B]">
              <span>sarah.chen@apexai.io</span>
              <span className="text-[#A0A0A0]">/</span>
              <span>demo-password-123</span>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-[#5F6368]">
          Don't have an organization account?{' '}
          <Link href="/register" className="font-semibold text-[#FF6B35] hover:underline">
            Register your organization
          </Link>
        </p>
      </div>
    </div>
  );
}

