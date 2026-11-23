'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Home, ShieldCheck } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#141413] flex flex-col justify-between p-6 antialiased selection:bg-[#FF6B35] selection:text-white">
      {/* Brand Header */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#FF6B35] flex items-center justify-center text-white shadow-xs">
            <ShieldCheck className="w-4 h-4 text-white" strokeWidth={2.4} />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 leading-none">
              <span className="font-serif font-medium tracking-tight text-[#141413] text-sm">SpendGuard</span>
              <span className="text-micro uppercase font-mono font-bold tracking-wider px-1.5 py-0.2 rounded-full bg-[#EFECE6] text-[#5F6368] border border-[#E5E0D8]">
                AI
              </span>
            </div>
            <span className="text-caption text-[#888882] font-mono mt-0.5">by Dattreo</span>
          </div>
        </Link>
      </header>

      {/* Main 404 Body */}
      <main className="max-w-md w-full mx-auto my-auto py-12 text-center space-y-6">
        <div className="p-8 rounded-[24px] bg-white border border-[#E5E0D8] shadow-2xs space-y-5">
          <div className="w-12 h-12 rounded-2xl bg-[#FAF8F5] border border-[#E5E0D8] flex items-center justify-center mx-auto text-[#FF6B35] font-mono font-bold text-sm shadow-2xs">
            404
          </div>

          <div className="space-y-2">
            <h1 className="font-serif text-2xl sm:text-3xl font-normal text-[#141413] tracking-tight">
              Surface Uncharted
            </h1>
            <p className="text-xs text-[#5F6368] leading-relaxed max-w-sm mx-auto">
              The requested telemetry endpoint or FinOps route could not be resolved by the SpendGuard gateway.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
            <Link
              href="/dashboard"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[#FF6B35] hover:bg-[#E55A25] text-white font-semibold text-xs shadow-2xs transition-colors"
            >
              <Home className="w-3.5 h-3.5" />
              <span>FinOps Console</span>
            </Link>
            <Link
              href="/"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[#FAF8F5] hover:bg-[#EFECE6] text-[#141413] border border-[#E5E0D8] font-semibold text-xs transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Home</span>
            </Link>
          </div>
        </div>
      </main>

      {/* Footer Attribution */}
      <footer className="max-w-6xl w-full mx-auto py-4 text-center text-xs text-[#888882] font-mono">
        SpendGuard AI · Engineered by <a href="https://www.dattreo.com" target="_blank" rel="noopener noreferrer" className="text-[#141413] hover:text-[#FF6B35] underline decoration-[#E5E0D8] underline-offset-4 transition-colors">Dattreo</a>
      </footer>
    </div>
  );
}

