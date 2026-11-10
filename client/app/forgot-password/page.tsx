'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, ArrowRight, Mail, TriangleAlert, CircleCheck, Loader2, Lock, Eye, EyeOff, KeyRound } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [resetToken, setResetToken] = useState('');
  
  // Reset password form state (when token is provided)
  const [tokenInput, setTokenInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setErrorMessage('Please provide a valid work email address.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setMessage('');

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Unable to request password recovery.');
      }

      setMessage(data.message || 'If an account exists for this email, recovery instructions have been initiated.');
      if (data.resetToken) {
        setResetToken(data.resetToken);
        setTokenInput(data.resetToken);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit recovery request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePerformReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setErrorMessage('Please provide a valid reset token.');
      return;
    }
    if (newPassword.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsResetting(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tokenInput.trim(),
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Unable to reset password.');
      }

      setResetSuccess(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reset password.');
    } finally {
      setIsResetting(false);
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
          Recover your workspace access
        </h2>
        <p className="mt-1.5 text-xs text-[#555550]">
          Secure, time-limited password recovery for SpendGuard AI accounts.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 rounded-[24px] sm:px-8 border border-[#E5E0D8] shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
          {errorMessage && (
            <div className="mb-5 p-3.5 rounded-2xl bg-red-50 border border-red-200 flex items-start gap-2.5">
              <TriangleAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs text-red-800 font-medium leading-relaxed">
                {errorMessage}
              </p>
            </div>
          )}

          {resetSuccess ? (
            <div className="text-center py-4 space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 mx-auto flex items-center justify-center text-emerald-600">
                <CircleCheck className="w-6 h-6" />
              </div>
              <h3 className="font-serif text-lg font-normal text-[#141413]">
                Password Reset Successfully
              </h3>
              <p className="text-xs text-[#555550] max-w-sm mx-auto">
                Your credentials have been securely updated using PBKDF2 hashing. You may now sign in with your new password.
              </p>
              <div className="pt-2">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-[#FF6B35] hover:bg-[#E55A25] text-white font-semibold text-xs sm:text-sm shadow-2xs transition-colors"
                >
                  <span>Sign In Now</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ) : message ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#FFF7F2] border border-[#FFD2C0] flex items-start gap-3">
                <CircleCheck className="w-4 h-4 text-[#FF6B35] shrink-0 mt-0.5" />
                <div className="text-xs text-[#141413] space-y-1">
                  <p className="font-semibold text-[#FF6B35]">Request Received</p>
                  <p className="text-[#555550]">{message}</p>
                </div>
              </div>

              {/* Informative dependency notice */}
              <div className="p-3.5 rounded-2xl bg-[#F8F8F7] border border-[#E5E0D8] text-[11px] text-[#555550] space-y-1">
                <span className="font-mono font-semibold uppercase text-[#141413] block">
                  Infrastructure Note:
                </span>
                <p>
                  External email dispatch requires an active SMTP or Resend API provider configuration in production.
                  {resetToken && (
                    <span className="block mt-1 text-[#141413] font-mono font-medium">
                      Development Token Generated: <code className="bg-white px-1.5 py-0.5 rounded border border-[#E5E0D8] select-all">{resetToken}</code>
                    </span>
                  )}
                </p>
              </div>

              {/* Reset Password Form when token is available */}
              <form className="space-y-3.5 pt-2" onSubmit={handlePerformReset}>
                <div>
                  <label className="block text-[11px] font-mono font-medium text-[#141413] uppercase tracking-wider mb-1">
                    Reset Token
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#888882]">
                      <KeyRound className="h-4 w-4" />
                    </div>
                    <input
                      type="text"
                      required
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder="Paste recovery token"
                      className="block w-full pl-10 pr-3.5 py-2.5 rounded-2xl border border-[#E5E0D8] bg-white text-xs sm:text-sm font-mono text-[#141413] placeholder-[#A0A09B] focus:outline-none focus:ring-1 focus:ring-[#FF6B35] focus:border-[#FF6B35]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-mono font-medium text-[#141413] uppercase tracking-wider mb-1">
                    New Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#888882]">
                      <Lock className="h-4 w-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      className="block w-full pl-10 pr-10 py-2.5 rounded-2xl border border-[#E5E0D8] bg-white text-xs sm:text-sm text-[#141413] placeholder-[#A0A09B] focus:outline-none focus:ring-1 focus:ring-[#FF6B35] focus:border-[#FF6B35]"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#888882] hover:text-[#141413]"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-mono font-medium text-[#141413] uppercase tracking-wider mb-1">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#888882]">
                      <Lock className="h-4 w-4" />
                    </div>
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className="block w-full pl-10 pr-10 py-2.5 rounded-2xl border border-[#E5E0D8] bg-white text-xs sm:text-sm text-[#141413] placeholder-[#A0A09B] focus:outline-none focus:ring-1 focus:ring-[#FF6B35] focus:border-[#FF6B35]"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#888882] hover:text-[#141413]"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isResetting}
                  className="w-full mt-2 inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-[#FF6B35] hover:bg-[#E55A25] text-white font-semibold text-xs sm:text-sm shadow-2xs transition-colors disabled:opacity-50"
                >
                  {isResetting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Updating password...</span>
                    </>
                  ) : (
                    <span>Set New Password</span>
                  )}
                </button>
              </form>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleRequestReset}>
              <div>
                <label className="block text-[11px] font-mono font-medium text-[#141413] uppercase tracking-wider mb-1.5">
                  Account Work Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#888882]">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="sarah.chen@company.com"
                    className="block w-full pl-10 pr-3.5 py-2.5 rounded-2xl border border-[#E5E0D8] bg-white text-xs sm:text-sm text-[#141413] placeholder-[#A0A09B] focus:outline-none focus:ring-1 focus:ring-[#FF6B35] focus:border-[#FF6B35] transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#FF6B35] hover:bg-[#E55A25] text-white font-semibold text-xs sm:text-sm shadow-2xs transition-colors disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sending recovery instructions...</span>
                  </>
                ) : (
                  <>
                    <span>Send Recovery Instructions</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          <div className="mt-6 pt-4 border-t border-[#E5E0D8] text-center">
            <Link
              href="/login"
              className="text-xs font-semibold text-[#FF6B35] hover:underline"
            >
              ← Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

