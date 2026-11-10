'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck, ArrowRight, Lock, Mail, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
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
      setErrorMessage(err.message || 'Login failed. Please verify your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Brand Logo */}
        <Link href="/" className="inline-flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#FF6B35] flex items-center justify-center text-white">
            <ShieldCheck className="w-5 h-5 text-white" strokeWidth={2.2} />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-serif text-xl font-normal tracking-tight text-[#141413]">
              SpendGuard <span className="text-[#FF6B35]">AI</span>
            </span>
            <span className="text-[10px] font-mono text-[#888882]">by Dattreo</span>
          </div>
        </Link>

        <h2 className="mt-6 font-serif text-2xl sm:text-3xl font-normal tracking-tight text-[#141413]">
          Sign in to your FinOps workspace
        </h2>
        <p className="mt-1.5 text-xs text-[#555550]">
          Real-time AI spend governance, budget guardrails, and key vaults.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 rounded-[24px] sm:px-8 border border-[#E5E0D8] shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
          {errorMessage && (
            <div className="mb-5 p-3.5 rounded-2xl bg-red-50 border border-red-200 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs text-red-800 font-medium leading-relaxed">
                {errorMessage}
              </p>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-[11px] font-mono font-medium text-[#141413] uppercase tracking-wider mb-1.5">
                Work Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#888882]">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="block w-full pl-10 pr-3.5 py-2.5 rounded-2xl border border-[#E5E0D8] bg-white text-xs sm:text-sm text-[#141413] placeholder-[#A0A09B] focus:outline-none focus:ring-1 focus:ring-[#FF6B35] focus:border-[#FF6B35] transition-colors"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-mono font-medium text-[#141413] uppercase tracking-wider">
                  Password
                </label>
                <Link href="/forgot-password" className="text-xs font-medium text-[#FF6B35] hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#888882]">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="block w-full pl-10 pr-10 py-2.5 rounded-2xl border border-[#E5E0D8] bg-white text-xs sm:text-sm text-[#141413] placeholder-[#A0A09B] focus:outline-none focus:ring-1 focus:ring-[#FF6B35] focus:border-[#FF6B35] transition-colors"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#888882] hover:text-[#141413] transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-3.5 h-3.5 rounded border-[#D0D0D0] text-[#FF6B35] focus:ring-[#FF6B35]"
                />
                <span className="text-xs text-[#555550]">Keep me signed in</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#FF6B35] hover:bg-[#E55A25] text-white font-semibold text-xs sm:text-sm shadow-2xs transition-colors disabled:opacity-50"
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

          {/* Secure Infrastructure Assurance */}
          <div className="mt-6 pt-4 border-t border-[#E5E0D8] text-center">
            <span className="text-[11px] font-mono text-[#888882]">
              Protected by sub-5ms Redis Lua pre-flight capacity reservations & AES-256-GCM encryption.
            </span>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-[#555550]">
          Don't have an organization account?{' '}
          <Link href="/register" className="font-semibold text-[#FF6B35] hover:underline">
            Register your organization
          </Link>
        </p>
      </div>
    </div>
  );
}
