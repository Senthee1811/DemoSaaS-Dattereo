'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  ShieldCheck, 
  ArrowRight, 
  Lock, 
  Mail, 
  User, 
  Building, 
  AlertCircle, 
  Loader2, 
  CheckCircle2, 
  Eye, 
  EyeOff,
  Check,
  X
} from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [orgName, setOrgName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Password strength calculation
  const strengthInfo = useMemo(() => {
    if (!password) return { score: 0, label: 'Empty', color: 'bg-zinc-200', textCol: 'text-zinc-500' };
    
    let score = 0;
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    if (score <= 1) return { score: 1, label: 'Weak', color: 'bg-red-500', textCol: 'text-red-600' };
    if (score <= 2) return { score: 2, label: 'Fair', color: 'bg-amber-500', textCol: 'text-amber-600' };
    if (score <= 3) return { score: 3, label: 'Good', color: 'bg-blue-500', textCol: 'text-blue-600' };
    return { score: 4, label: 'Strong', color: 'bg-emerald-500', textCol: 'text-emerald-600' };
  }, [password]);

  const passwordsMatch = useMemo(() => {
    if (!confirmPassword) return null;
    return password === confirmPassword;
  }, [password, confirmPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password || !confirmPassword || !orgName.trim()) {
      setErrorMessage('Please fill out all required fields.');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify your confirmation password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          orgName: orgName.trim(),
          orgSlug: orgName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
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
        // Flag for the post-signup welcome experience
        sessionStorage.setItem('spendguard_just_registered', 'true');
      }

      // Route to guided activation journey
      router.push('/onboarding');
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred during registration.');
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
          Create your FinOps organization
        </h2>
        <p className="mt-1.5 text-xs text-[#555550]">
          Enforce sub-5ms Redis budget reservations across OpenAI, Anthropic, and Gemini.
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

          <form className="space-y-3.5" onSubmit={handleSubmit}>
            {/* 1. Full Name */}
            <div>
              <label className="block text-[11px] font-mono font-medium text-[#141413] uppercase tracking-wider mb-1">
                Full Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#888882]">
                  <User className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Elena Rostova"
                  className="block w-full pl-10 pr-3.5 py-2.5 rounded-2xl border border-[#E5E0D8] bg-white text-xs sm:text-sm text-[#141413] placeholder-[#A0A09B] focus:outline-none focus:ring-1 focus:ring-[#FF6B35] focus:border-[#FF6B35] transition-colors"
                />
              </div>
            </div>

            {/* 2. Work Email */}
            <div>
              <label className="block text-[11px] font-mono font-medium text-[#141413] uppercase tracking-wider mb-1">
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
                  placeholder="elena@company.com"
                  className="block w-full pl-10 pr-3.5 py-2.5 rounded-2xl border border-[#E5E0D8] bg-white text-xs sm:text-sm text-[#141413] placeholder-[#A0A09B] focus:outline-none focus:ring-1 focus:ring-[#FF6B35] focus:border-[#FF6B35] transition-colors"
                />
              </div>
            </div>

            {/* 3. Organization Name */}
            <div>
              <label className="block text-[11px] font-mono font-medium text-[#141413] uppercase tracking-wider mb-1">
                Organization Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#888882]">
                  <Building className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  required
                  autoComplete="organization"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Acme Innovations Inc."
                  className="block w-full pl-10 pr-3.5 py-2.5 rounded-2xl border border-[#E5E0D8] bg-white text-xs sm:text-sm text-[#141413] placeholder-[#A0A09B] focus:outline-none focus:ring-1 focus:ring-[#FF6B35] focus:border-[#FF6B35] transition-colors"
                />
              </div>
            </div>

            {/* 4. Password */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-mono font-medium text-[#141413] uppercase tracking-wider">
                  Password
                </label>
                {password && (
                  <span className={`text-[10px] font-mono font-semibold ${strengthInfo.textCol}`}>
                    {strengthInfo.label}
                  </span>
                )}
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#888882]">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
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

              {/* Password strength visual meter */}
              {password && (
                <div className="mt-1.5 space-y-1">
                  <div className="flex gap-1 h-1 w-full bg-[#F3F3F0] rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-200 ${strengthInfo.score >= 1 ? strengthInfo.color : 'bg-transparent'}`} style={{ width: '25%' }} />
                    <div className={`h-full transition-all duration-200 ${strengthInfo.score >= 2 ? strengthInfo.color : 'bg-transparent'}`} style={{ width: '25%' }} />
                    <div className={`h-full transition-all duration-200 ${strengthInfo.score >= 3 ? strengthInfo.color : 'bg-transparent'}`} style={{ width: '25%' }} />
                    <div className={`h-full transition-all duration-200 ${strengthInfo.score >= 4 ? strengthInfo.color : 'bg-transparent'}`} style={{ width: '25%' }} />
                  </div>
                </div>
              )}
            </div>

            {/* 5. Confirm Password */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-mono font-medium text-[#141413] uppercase tracking-wider">
                  Confirm Password
                </label>
                {confirmPassword && (
                  <span className="text-[10px] font-mono flex items-center gap-1">
                    {passwordsMatch ? (
                      <span className="text-emerald-600 flex items-center gap-0.5">
                        <Check className="w-3 h-3" /> Match
                      </span>
                    ) : (
                      <span className="text-red-600 flex items-center gap-0.5">
                        <X className="w-3 h-3" /> Mismatch
                      </span>
                    )}
                  </span>
                )}
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#888882]">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className={`block w-full pl-10 pr-10 py-2.5 rounded-2xl border ${
                    passwordsMatch === false ? 'border-red-400 focus:border-red-500 focus:ring-red-400' : 'border-[#E5E0D8] focus:border-[#FF6B35] focus:ring-[#FF6B35]'
                  } bg-white text-xs sm:text-sm text-[#141413] placeholder-[#A0A09B] focus:outline-none focus:ring-1 transition-colors`}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#888882] hover:text-[#141413] transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading || (confirmPassword.length > 0 && !passwordsMatch)}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#FF6B35] hover:bg-[#E55A25] text-white font-semibold text-xs sm:text-sm shadow-2xs transition-colors disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creating workspace...</span>
                  </>
                ) : (
                  <>
                    <span>Continue to Workspace Setup</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Guarantees */}
          <div className="mt-6 pt-4 border-t border-[#E5E0D8] space-y-2">
            <div className="flex items-center gap-2 text-xs text-[#555550]">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Fail-closed protection on all upstream inference calls</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#555550]">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>AES-256-GCM envelope encryption for all provider keys</span>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-[#555550]">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-[#FF6B35] hover:underline">
            Sign in to existing workspace
          </Link>
        </p>
      </div>
    </div>
  );
}
