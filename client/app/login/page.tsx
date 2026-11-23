'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck, ArrowRight, Lock, Mail, Loader2, Eye, EyeOff } from 'lucide-react';
import { readApiError, saveSession } from '@/lib/auth-fetch';
import { useQueryParam } from '@/lib/client-storage';
import { InlineAlert } from '@/components/ui/feedback';
import { errorMessage as toMessage } from '@/lib/types';
import { Tip } from '@/components/ui/tooltip';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Notices driven by the redirect that brought the user here
  const deactivatedNotice = useQueryParam('deactivated') === 'true';
  const expired = useQueryParam('expired');
  const required = useQueryParam('required');
  const signedOut = useQueryParam('signedOut');
  const sessionNotice = signedOut
    ? 'You have been signed out.'
    : expired
    ? 'Your session expired. Please sign in again.'
    : required
      ? 'Please sign in to continue.'
      : '';

  /** Only allow same-origin relative paths as post-login destinations (no open redirects). */
  const resolveNextPath = (): string => {
    const next = new URLSearchParams(window.location.search).get('next') || '';
    return next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/dashboard';
  };

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

      if (!res.ok) {
        throw new Error(await readApiError(res, 'Invalid email or password.'));
      }

      saveSession(await res.json());
      router.push(resolveNextPath());
    } catch (err: unknown) {
      setErrorMessage(toMessage(err, 'Login failed. Please verify your credentials.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-parchment-ivory flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Brand Logo */}
        <Link href="/" className="inline-flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white">
            <ShieldCheck className="w-5 h-5 text-white" strokeWidth={2.2} />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-serif text-xl font-normal tracking-tight text-fg">
              SpendGuard <span className="text-accent">AI</span>
            </span>
            <span className="text-caption font-mono text-fg-muted">by Dattreo</span>
          </div>
        </Link>

        <h2 className="mt-6 font-serif text-2xl sm:text-3xl font-normal tracking-tight text-fg">
          Sign in to your FinOps workspace
        </h2>
        <p className="mt-1.5 text-xs text-fg-secondary">
          Real-time AI spend governance, budget guardrails, and key vaults.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-surface py-8 px-6 rounded-card sm:px-8 border border-parchment-border shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
          {deactivatedNotice && (
            <InlineAlert variant="warning" title="Account Deactivated" className="mb-5">
              Your account has been deactivated and all active sessions have been invalidated. Workspace data and team members remain unaffected.
            </InlineAlert>
          )}

          {sessionNotice && !deactivatedNotice && (
            <InlineAlert variant={signedOut ? 'success' : 'warning'} title={sessionNotice} className="mb-5" />
          )}

          {errorMessage && (
            <InlineAlert variant="error" className="mb-5">{errorMessage}</InlineAlert>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-label font-mono font-medium text-fg uppercase tracking-wider mb-1.5">
                Work Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-fg-muted">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="block w-full pl-10 pr-3.5 py-2.5 rounded-field border border-parchment-border bg-surface text-xs sm:text-sm text-fg placeholder-fg-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-colors"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-label font-mono font-medium text-fg uppercase tracking-wider">
                  Password
                </label>
                <Link href="/forgot-password" className="text-xs font-medium text-accent hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-fg-muted">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="block w-full pl-10 pr-10 py-2.5 rounded-field border border-parchment-border bg-surface text-xs sm:text-sm text-fg placeholder-fg-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-colors"
                />
                <Tip label={showPassword ? 'Hide password' : 'Show password'}>
                  <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-fg-muted hover:text-fg transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                </Tip>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-3.5 h-3.5 rounded-control border-line text-accent focus:ring-accent"
                />
                <span className="text-xs text-fg-secondary">Keep me signed in</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-accent hover:bg-accent-hover text-white font-semibold text-xs sm:text-sm shadow-2xs transition-colors disabled:opacity-50"
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
          <div className="mt-6 pt-4 border-t border-parchment-border text-center">
            <span className="text-label font-mono text-fg-muted">
              Protected by sub-5ms Redis Lua pre-flight capacity reservations & AES-256-GCM encryption.
            </span>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-fg-secondary">
          Don&apos;t have an organization account?{' '}
          <Link href="/register" className="font-semibold text-accent hover:underline">
            Register your organization
          </Link>
        </p>
      </div>
    </div>
  );
}
