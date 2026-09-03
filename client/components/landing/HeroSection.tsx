'use client';

import React, { useState, useEffect } from 'react';
import { 
  ArrowRight, 
  Sparkles, 
  Mic, 
  MicOff, 
  Video, 
  Check, 
  Star, 
  TrendingUp, 
  Play, 
  Pause, 
  Activity, 
  CheckCircle2, 
  Users, 
  ShieldCheck, 
  Flame,
  Volume2
} from 'lucide-react';

const DYNAMIC_INSIGHTS = [
  {
    author: "Aura Intelligence",
    text: "Action Item: Elena agreed to finalize Q3 latency benchmarks by Friday.",
    tag: "Action Item",
    time: "Just now",
    confidence: "99.4%"
  },
  {
    author: "Aura Intelligence",
    text: "Key Decision: Team approved multi-provider gateway architecture for v2.0.",
    tag: "Decision",
    time: "2m ago",
    confidence: "98.9%"
  },
  {
    author: "Aura Intelligence",
    text: "Budget Highlight: Current sprint infrastructure spend reduced by 32%.",
    tag: "Budget Alert",
    time: "4m ago",
    confidence: "99.1%"
  }
];

export function HeroSection() {
  const [isPlayingAudio, setIsPlayingAudio] = useState(true);
  const [currentInsightIdx, setCurrentInsightIdx] = useState(0);
  const [waveHeights, setWaveHeights] = useState([12, 24, 16, 28, 8, 20, 32, 14, 22, 30, 18, 26, 10, 28, 15, 22, 9, 25, 18, 30]);

  // Animate audio waveform dynamically when playing
  useEffect(() => {
    if (!isPlayingAudio) return;
    const interval = setInterval(() => {
      setWaveHeights(prev => prev.map(() => Math.floor(Math.random() * 26 + 6)));
    }, 280);
    return () => clearInterval(interval);
  }, [isPlayingAudio]);

  const handleNextInsight = () => {
    setCurrentInsightIdx((prev) => (prev + 1) % DYNAMIC_INSIGHTS.length);
  };

  const currentInsight = DYNAMIC_INSIGHTS[currentInsightIdx];

  return (
    <section className="relative w-full py-6 px-4 sm:px-6 lg:px-8 overflow-hidden">
      {/* Soft Orange Ambient Background Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] bg-gradient-to-br from-[#FFE3D6]/70 via-[#FFD2C0]/40 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-10 right-10 w-[400px] h-[400px] bg-[#FF8A4C]/15 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-10 left-10 w-[450px] h-[450px] bg-[#FF6B35]/10 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Main SaaS Rounded Container */}
      <div className="max-w-[1240px] mx-auto bg-white rounded-[36px] sm:rounded-[42px] border border-[#F0ECE7] saas-container-shadow p-6 sm:p-10 lg:p-14 relative">
        {/* Top Grid: Two-Column Hero Content */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          
          {/* Left Column: Hero Content & CTA (6 cols) */}
          <div className="lg:col-span-6 space-y-6 sm:space-y-7 text-left">
            
            {/* Top Pill / Badge */}
            <div className="inline-flex items-center space-x-2.5 px-3.5 py-1.5 rounded-full bg-[#FFF1EA] border border-[#FFD9C7] text-xs font-semibold text-[#FF6B35]">
              <span className="w-2 h-2 rounded-full bg-[#FF6B35] animate-beacon" />
              <span>Real-Time Voice Intelligence 2.0</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-[64px] font-extrabold tracking-tight leading-[1.08] text-[#111111]">
              <span className="text-orange-gradient block">AI intelligence</span>
              <span>for real-time</span>
              <br className="hidden sm:inline" />
              <span className="text-[#111111]"> conversations</span>
            </h1>

            {/* Subtitle Description */}
            <p className="text-base sm:text-lg text-[#555555] max-w-lg leading-relaxed font-normal">
              Capture conversations, understand what matters, and get real-time AI insights without taking manual notes.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-4 pt-1">
              {/* Primary CTA */}
              <a
                href="#signup"
                className="inline-flex items-center justify-center space-x-2.5 px-7 py-3.5 bg-gradient-to-r from-[#FF6B35] to-[#FF8A4C] hover:from-[#F55D25] hover:to-[#FF7B38] text-white text-[15.5px] font-bold rounded-full shadow-lg shadow-[#FF6B35]/30 hover:shadow-xl hover:shadow-[#FF6B35]/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 group"
              >
                <span>Start for free</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-150" />
              </a>

              {/* Secondary CTA */}
              <a
                href="#demo"
                className="inline-flex items-center justify-center space-x-2 px-6 py-3.5 bg-white hover:bg-[#FFF8F5] text-[#111111] hover:text-[#FF6B35] text-[15.5px] font-semibold rounded-full border border-[#E0DCD6] hover:border-[#FFC7B0] transition-all duration-200 shadow-sm"
              >
                <span>Contact us</span>
              </a>
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap items-center gap-y-2 gap-x-4 pt-2 text-xs font-medium text-[#666666]">
              <div className="flex items-center space-x-1.5">
                <Check className="w-3.5 h-3.5 text-[#FF6B35] stroke-[3]" />
                <span>14-day free trial</span>
              </div>
              <span className="text-[#CCCCCC]">•</span>
              <div className="flex items-center space-x-1.5">
                <Check className="w-3.5 h-3.5 text-[#FF6B35] stroke-[3]" />
                <span>No credit card required</span>
              </div>
              <span className="text-[#CCCCCC]">•</span>
              <div className="flex items-center space-x-1.5">
                <Check className="w-3.5 h-3.5 text-[#FF6B35] stroke-[3]" />
                <span>Cancel anytime</span>
              </div>
            </div>

          </div>

          {/* Right Column: Floating AI Conversation Visual (6 cols) */}
          <div className="lg:col-span-6 relative flex items-center justify-center min-h-[440px] sm:min-h-[500px] lg:min-h-[520px] select-none">
            
            {/* Decorative Connection Nodes / Ambient Radiance */}
            <div className="absolute inset-0 bg-gradient-to-tr from-[#FF6B35]/10 via-transparent to-[#FF8A4C]/10 rounded-3xl blur-2xl -z-10" />

            {/* SVG Connecting Curves behind floating cards */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none stroke-[#FF6B35]/25" strokeDasharray="4 4" fill="none">
              <path d="M 80 120 Q 220 180 320 220" strokeWidth="1.5" />
              <path d="M 400 130 Q 340 240 280 300" strokeWidth="1.5" />
              <path d="M 120 380 Q 200 320 300 280" strokeWidth="1.5" />
            </svg>

            {/* 1. CENTRAL AI CONVERSATION ANALYSIS CARD (Dark Obsidian) */}
            <div className="w-full max-w-[420px] bg-[#111111] text-white rounded-3xl p-6 border border-white/10 dark-card-shadow relative z-10">
              
              {/* Header: Title & Live Badge */}
              <div className="flex items-center justify-between pb-3.5 border-b border-white/10">
                <div className="flex items-center space-x-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#FF6B35] animate-beacon" />
                  <span className="text-[13px] font-bold tracking-tight text-white">Sprint & Architecture Sync</span>
                </div>
                <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-white/10 text-[11px] font-mono text-[#FF8A4C]">
                  <span>00:24:18</span>
                  <span className="text-emerald-400 font-bold">● Live</span>
                </div>
              </div>

              {/* Real-time Waveform Visualizer */}
              <div className="py-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-white/60">
                  <span className="flex items-center space-x-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-[#FF6B35]" />
                    <span>Live Voice Audio Stream</span>
                  </span>
                  <button
                    onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                    className="flex items-center space-x-1 text-[11px] text-[#FF8A4C] hover:text-white transition-colors"
                  >
                    {isPlayingAudio ? (
                      <>
                        <Pause className="w-3 h-3" />
                        <span>Pause</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3" />
                        <span>Resume</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Animated Waveform Bars */}
                <div className="h-10 flex items-center justify-center space-x-1 px-2 py-1 bg-white/5 rounded-xl border border-white/5">
                  {waveHeights.map((h, i) => (
                    <div
                      key={i}
                      className="w-1.5 rounded-full bg-gradient-to-t from-[#FF6B35] to-[#FFA270] transition-all duration-200"
                      style={{ height: `${isPlayingAudio ? h : 4}px` }}
                    />
                  ))}
                </div>
              </div>

              {/* AI Status & Active Transcript Highlight */}
              <div className="p-3 bg-white/5 rounded-2xl border border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 text-xs text-[#FF8A4C] font-semibold">
                    <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                    <span>AI Analyzing Speech & Intent</span>
                  </div>
                  <span className="text-[10px] text-white/40 font-mono">99.4% Latency: 120ms</span>
                </div>

                {/* Live Speaker Speech Snippet */}
                <div className="flex items-start space-x-2.5 pt-1">
                  <img
                    src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80"
                    alt="Elena Vance"
                    className="w-6 h-6 rounded-full border border-[#FF6B35] object-cover shrink-0 mt-0.5"
                  />
                  <p className="text-xs text-white/90 leading-relaxed">
                    <span className="font-semibold text-[#FF8A4C]">Elena:</span> "...we can deploy latency reduction benchmarks by Friday and lock the API surface."
                  </p>
                </div>
              </div>

              {/* Bottom Card Controls */}
              <div className="pt-3.5 mt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-white/60">
                <div className="flex items-center space-x-1">
                  <Users className="w-3.5 h-3.5 text-[#FF6B35]" />
                  <span>4 Participants Active</span>
                </div>
                <button
                  onClick={handleNextInsight}
                  className="px-2.5 py-1 rounded-lg bg-[#FF6B35]/20 hover:bg-[#FF6B35]/30 text-[#FF8A4C] font-semibold text-[11px] transition-all flex items-center space-x-1"
                >
                  <span>Simulate Next Insight</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* 2. FLOATING PARTICIPANT 1 (Top Left): Elena Vance (Speaking) */}
            <div className="absolute -top-4 -left-3 sm:-left-6 bg-white/95 backdrop-blur-md rounded-2xl p-2.5 sm:p-3 border border-[#F0ECE7] floating-card-shadow flex items-center space-x-2.5 animate-float-slow z-20">
              <div className="relative">
                <img
                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80"
                  alt="Elena Vance"
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-cover border border-[#FF6B35]"
                />
                <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center">
                  <Mic className="w-2 h-2 text-white" />
                </span>
              </div>
              <div className="text-left pr-1">
                <p className="text-xs font-bold text-[#111111] leading-none">Elena Vance</p>
                <p className="text-[10px] text-[#FF6B35] font-semibold mt-0.5">Speaking • VP Product</p>
              </div>
            </div>

            {/* 3. FLOATING PARTICIPANT 2 (Bottom Right): Marcus Thorne */}
            <div className="absolute -bottom-4 -right-2 sm:-right-4 bg-white/95 backdrop-blur-md rounded-2xl p-2.5 sm:p-3 border border-[#F0ECE7] floating-card-shadow flex items-center space-x-2.5 animate-float-delayed z-20">
              <div className="relative">
                <img
                  src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80"
                  alt="Marcus Thorne"
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-cover border border-[#E0DCD6]"
                />
                <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-[#111111] rounded-full border-2 border-white flex items-center justify-center">
                  <Video className="w-2 h-2 text-white" />
                </span>
              </div>
              <div className="text-left pr-1">
                <p className="text-xs font-bold text-[#111111] leading-none">Marcus Thorne</p>
                <p className="text-[10px] text-[#777777] font-medium mt-0.5">Lead AI Architect</p>
              </div>
            </div>

            {/* 4. FLOATING AI INSIGHT CARD (Top Right Overlapping) */}
            <div className="absolute top-2 -right-2 sm:-right-8 max-w-[240px] sm:max-w-[270px] bg-white rounded-2xl p-3.5 border border-[#FFE0D1] floating-card-shadow animate-float-subtle z-30 transition-all duration-300">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center space-x-1.5">
                  <div className="w-5 h-5 rounded-md bg-[#FFF1EA] flex items-center justify-center text-[#FF6B35]">
                    <Sparkles className="w-3 h-3" />
                  </div>
                  <span className="text-[11px] font-bold text-[#FF6B35] uppercase tracking-wider">{currentInsight.tag}</span>
                </div>
                <span className="text-[10px] text-[#888888]">{currentInsight.time}</span>
              </div>
              <p className="text-[11px] sm:text-xs font-medium text-[#222222] leading-snug">
                {currentInsight.text}
              </p>
              <div className="flex items-center justify-between pt-2 mt-1.5 border-t border-[#F5F2EE] text-[10px] text-[#777777]">
                <span>Confidence: <strong className="text-emerald-600">{currentInsight.confidence}</strong></span>
                <span className="text-[#FF6B35] font-semibold">Auto-synced</span>
              </div>
            </div>

            {/* 5. FLOATING REVIEW / TRUST BADGE (Bottom Left) */}
            <div className="absolute bottom-6 -left-3 sm:-left-7 bg-white rounded-2xl px-3.5 py-2.5 border border-[#F0ECE7] floating-card-shadow flex items-center space-x-2.5 animate-float-slow z-20">
              <div className="w-7 h-7 rounded-xl bg-[#FFF1EA] flex items-center justify-center text-[#FF6B35] font-bold">
                <Star className="w-4 h-4 fill-[#FF6B35]" />
              </div>
              <div className="text-left">
                <div className="flex items-center space-x-0.5 text-amber-500">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-3 h-3 fill-[#FF6B35] text-[#FF6B35]" />
                  ))}
                </div>
                <p className="text-[10.5px] font-bold text-[#222222] mt-0.5">4.9/5 from 2,400+ teams</p>
              </div>
            </div>

            {/* 6. FLOATING SENTIMENT PILL (Right Middle) */}
            <div className="hidden sm:flex absolute top-1/2 -right-6 -translate-y-1/2 bg-[#111111] text-white rounded-full px-3 py-1.5 border border-white/10 floating-card-shadow items-center space-x-2 z-20">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10.5px] font-bold text-white">96% Positive Sentiment</span>
              <TrendingUp className="w-3 h-3 text-emerald-400" />
            </div>

          </div>

        </div>

        {/* Bottom Logo / Trust Section */}
        <div className="mt-14 sm:mt-16 pt-8 border-t border-[#F0ECE7]">
          {/* Promo Offer Banner */}
          <div className="flex flex-col sm:flex-row items-center justify-between bg-[#FFF8F5] border border-[#FFD9C7] rounded-2xl px-5 py-3.5 mb-8 text-center sm:text-left gap-3">
            <div className="flex items-center space-x-2.5">
              <div className="w-6 h-6 rounded-full bg-[#FF6B35]/15 flex items-center justify-center text-[#FF6B35] shrink-0">
                <Flame className="w-3.5 h-3.5" />
              </div>
              <p className="text-xs sm:text-sm font-semibold text-[#111111]">
                Get premium AI features with our early-access offer
              </p>
            </div>
            <a
              href="#pricing"
              className="inline-flex items-center space-x-1.5 px-4 py-1.5 bg-[#FF6B35] hover:bg-[#F55D25] text-white text-xs font-bold rounded-full shadow-sm transition-all"
            >
              <span>Claim 3 Months Free</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Fictional monochrome client logos */}
          <div className="space-y-3">
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-[#888888]">
              Trusted by high-growth engineering & product teams worldwide
            </p>
            <div className="flex flex-wrap items-center justify-center sm:justify-between gap-6 sm:gap-8 pt-2 opacity-70 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-300">
              {/* Logo 1: Orbitly */}
              <div className="flex items-center space-x-2">
                <svg className="w-6 h-6 text-[#111111]" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" />
                  <circle cx="12" cy="7" r="2.5" />
                </svg>
                <span className="font-extrabold text-base tracking-tight text-[#111111]">Orbitly</span>
              </div>

              {/* Logo 2: NovaLabs */}
              <div className="flex items-center space-x-2">
                <svg className="w-6 h-6 text-[#111111]" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="12,2 22,20 2,20" fill="none" stroke="currentColor" strokeWidth="2.5" />
                  <circle cx="12" cy="14" r="2" />
                </svg>
                <span className="font-extrabold text-base tracking-tight text-[#111111]">NovaLabs</span>
              </div>

              {/* Logo 3: Flowmark */}
              <div className="flex items-center space-x-2">
                <svg className="w-6 h-6 text-[#111111]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4 12h16M12 4v16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                <span className="font-extrabold text-base tracking-tight text-[#111111]">Flowmark</span>
              </div>

              {/* Logo 4: Syntra */}
              <div className="flex items-center space-x-2">
                <svg className="w-6 h-6 text-[#111111]" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" strokeWidth="2.5" />
                  <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="font-extrabold text-base tracking-tight text-[#111111]">Syntra</span>
              </div>

              {/* Logo 5: Northstar */}
              <div className="flex items-center space-x-2">
                <svg className="w-6 h-6 text-[#111111]" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="12,2 15,9 22,12 15,15 12,22 9,15 2,12 9,9" />
                </svg>
                <span className="font-extrabold text-base tracking-tight text-[#111111]">Northstar</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
