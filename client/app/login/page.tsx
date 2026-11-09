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

        <h2 className="mt-6 text-2xl sm:text-3xl font-extrabold tracking-tight text-[#111111]">
          Sign in to your account
        </h2>
        <p className="mt-2 text-sm text-[#666666]">
          Real-time AI spend governance, budget guardrails, and key vaults.
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

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-bold text-[#111111] uppercase tracking-wider mb-2">
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
                  placeholder="sarah.chen@apexai.io"
                  className="block w-full pl-10 pr-4 py-3 rounded-2xl border border-[#E8E8E8] bg-white text-sm text-[#111111] placeholder-[#AAAAAA] focus:outline-none focus:ring-2 focus:ring-[#FF6B35] focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-[#111111] uppercase tracking-wider">
                  Password
                </label>
                <a href="#" className="text-xs font-semibold text-[#FF6B35] hover:underline">
                  Forgot password?
                </a>
              </div>
              <div className="relative rounded-2xl">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#999999]">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="block w-full pl-10 pr-4 py-3 rounded-2xl border border-[#E8E8E8] bg-white text-sm text-[#111111] placeholder-[#AAAAAA] focus:outline-none focus:ring-2 focus:ring-[#FF6B35] focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-4 h-4 rounded border-[#D0D0D0] text-[#FF6B35] focus:ring-[#FF6B35]"
                />
                <span className="text-xs text-[#666666] font-medium">Keep me signed in</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] text-white font-bold text-sm shadow-md shadow-[#FF6B35]/25 hover:shadow-lg hover:shadow-[#FF6B35]/35 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign in to Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Demo account helper badge */}
          <div className="mt-6 pt-5 border-t border-[#F0ECE7] text-center">
            <p className="text-xs text-[#888888]">
              Demo credentials: <span className="font-mono text-[#111111] bg-[#F7F5F2] px-1.5 py-0.5 rounded">sarah.chen@apexai.io</span> / <span className="font-mono text-[#111111] bg-[#F7F5F2] px-1.5 py-0.5 rounded">demo-password-123</span>
            </p>
          </div>
        </div>

        <p className="mt-8 text-center text-sm text-[#666666]">
          Don't have an organization account?{' '}
          <Link href="/register" className="font-bold text-[#FF6B35] hover:underline">
            Start free 14-day trial
          </Link>
        </p>
      </div>
    </div>
  );
}
