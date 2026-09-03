'use client';

import React, { useState } from 'react';
import { 
  Sparkles, 
  CheckCircle2, 
  Copy, 
  Check, 
  Send, 
  Share2, 
  Download, 
  Globe, 
  TrendingUp, 
  Zap, 
  FileText, 
  CheckSquare, 
  PieChart 
} from 'lucide-react';

export function InteractiveDemoSection() {
  const [activeTab, setActiveTab] = useState<'summary' | 'actions' | 'sentiment' | 'translate'>('summary');
  const [copied, setCopied] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="features" className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 max-w-[1240px] mx-auto">
      {/* Section Header */}
      <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
        <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-[#FFF1EA] border border-[#FFD9C7] text-xs font-bold text-[#FF6B35]">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Interactive AI Workspace</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#111111]">
          Everything you need from a conversation, <span className="text-orange-gradient">delivered in seconds</span>
        </h2>
        <p className="text-base text-[#666666]">
          Experience how Aura AI extracts decisions, tracks action items, and generates structured deliverables in real time.
        </p>
      </div>

      {/* Interactive Tabs Bar */}
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-8">
        {[
          { id: 'summary', label: 'Executive Summary', icon: FileText },
          { id: 'actions', label: 'Action Items & Tasks', icon: CheckSquare },
          { id: 'sentiment', label: 'Speaker Analytics', icon: PieChart },
          { id: 'translate', label: 'Live Translation', icon: Globe }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-4 sm:px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 ${
                isActive
                  ? 'bg-[#111111] text-white shadow-md'
                  : 'bg-white text-[#555555] hover:text-[#111111] hover:bg-[#FFF8F5] border border-[#EBE7E2]'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-[#FF8A4C]' : 'text-[#888888]'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Interactive Workspace Card */}
      <div className="bg-white rounded-3xl border border-[#F0ECE7] saas-container-shadow overflow-hidden">
        {/* Workspace Top Toolbar */}
        <div className="bg-[#FAF8F5] border-b border-[#F0ECE7] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 rounded-full bg-rose-400" />
            <div className="w-3 h-3 rounded-full bg-amber-400" />
            <div className="w-3 h-3 rounded-full bg-emerald-400" />
            <div className="h-4 w-px bg-[#E0DCD6] mx-1" />
            <span className="text-xs font-bold text-[#111111]">⚡ Session #4912: Q3 Roadmap & Architecture Alignment</span>
            <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-[#FFF1EA] text-[#FF6B35] text-[10px] font-bold">
              Synced to Notion & Slack
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleCopy('Aura AI Output Copied')}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-[#FFF8F5] text-xs font-semibold text-[#333333] border border-[#E0DCD6] rounded-lg transition-all"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-[#777777]" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#FF6B35] hover:bg-[#F55D25] text-xs font-semibold text-white rounded-lg transition-all shadow-sm">
              <Share2 className="w-3.5 h-3.5" />
              <span>Push to Jira</span>
            </button>
          </div>
        </div>

        {/* Tabbed Content Area */}
        <div className="p-6 sm:p-8 lg:p-10">
          {activeTab === 'summary' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-[#111111] mb-2">Executive Summary</h3>
                <p className="text-sm text-[#444444] leading-relaxed">
                  The team aligned on the Q3 multi-provider AI gateway architecture. Key priorities include cutting OpenAI/Claude model proxy overhead to under 120ms, enabling real-time budget guardrails, and releasing the SOC2 compliance export engine by mid-quarter.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-2xl bg-[#FFF8F5] border border-[#FFD9C7] space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#FF6B35]">Key Takeaways</span>
                  <ul className="space-y-1.5 text-xs text-[#333333]">
                    <li className="flex items-start space-x-2">
                      <span className="text-[#FF6B35] font-bold">•</span>
                      <span>Targeting 99.9% uptime with fail-closed budget guardrails.</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="text-[#FF6B35] font-bold">•</span>
                      <span>Reduced LLM token consumption by 32% via automated prompt caching.</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="text-[#FF6B35] font-bold">•</span>
                      <span>All team leads agreed on weekly budget threshold notifications.</span>
                    </li>
                  </ul>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-[#EBE7E2] space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#111111]">Risk Assessment</span>
                  <p className="text-xs text-[#555555] leading-relaxed">
                    Low risk on provider rate limits due to fallback routing; staging testing scheduled for Thursday 2 PM.
                  </p>
                  <div className="flex items-center space-x-2 pt-2 text-[11px] text-emerald-600 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>All 4 stakeholders approved roadmap milestones</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'actions' && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-[#111111] mb-1">Automated Action Items & Owners</h3>
              <p className="text-xs text-[#666666] mb-4">Aura AI extracted 4 actionable tasks with assigned owners and due dates.</p>

              <div className="space-y-3">
                {[
                  { task: "Finalize latency benchmark tests for Claude 3.5 Sonnet proxy layer", owner: "Marcus Thorne", due: "Friday, 5:00 PM", priority: "HIGH" },
                  { task: "Update enterprise key vault AES-256 rotation policy in docs", owner: "Sarah Chen", due: "Next Monday", priority: "MEDIUM" },
                  { task: "Review SOC2 compliance CSV export with security auditor", owner: "Elena Vance", due: "Wednesday", priority: "HIGH" },
                  { task: "Set up Slack webhook alerts for 80% project budget threshold", owner: "Alex Rivera", due: "Tomorrow", priority: "MEDIUM" }
                ].map((item, idx) => (
                  <div key={idx} className="p-3.5 rounded-2xl bg-[#FFF8F5] border border-[#F0ECE7] flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-[#FFC7B0] transition-colors">
                    <div className="flex items-start space-x-3">
                      <div className="w-5 h-5 rounded-md bg-[#FF6B35]/20 flex items-center justify-center text-[#FF6B35] mt-0.5 shrink-0">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm font-semibold text-[#111111]">{item.task}</p>
                        <p className="text-[11px] text-[#777777] mt-0.5">Assigned to: <strong className="text-[#333333]">{item.owner}</strong> • Due: {item.due}</p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold self-start sm:self-auto ${
                      item.priority === 'HIGH' ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20' : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                    }`}>
                      {item.priority} PRIORITY
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'sentiment' && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-[#111111] mb-1">Speaker Engagement & Sentiment Breakdown</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-[#FFF8F5] border border-[#FFD9C7] text-center space-y-1">
                  <span className="text-xs text-[#777777] font-semibold">Overall Sentiment</span>
                  <p className="text-2xl font-extrabold text-[#FF6B35]">96% Positive</p>
                  <span className="text-[10px] text-emerald-600 font-bold">High Alignment</span>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-[#EBE7E2] text-center space-y-1">
                  <span className="text-xs text-[#777777] font-semibold">Speaking Pace</span>
                  <p className="text-2xl font-extrabold text-[#111111]">142 WPM</p>
                  <span className="text-[10px] text-[#777777]">Optimal Clarity</span>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-[#EBE7E2] text-center space-y-1">
                  <span className="text-xs text-[#777777] font-semibold">Total Speaking Time</span>
                  <p className="text-2xl font-extrabold text-[#111111]">24m 18s</p>
                  <span className="text-[10px] text-[#777777]">4 Participants</span>
                </div>
              </div>

              {/* Speaker Airtime Distribution */}
              <div className="space-y-3 pt-2">
                <span className="text-xs font-bold text-[#111111] uppercase tracking-wider">Airtime Share per Speaker</span>
                {[
                  { name: "Elena Vance (VP Product)", pct: 42, color: "bg-[#FF6B35]" },
                  { name: "Marcus Thorne (Lead AI Architect)", pct: 31, color: "bg-[#FF8A4C]" },
                  { name: "Sarah Chen (Engineering Lead)", pct: 18, color: "bg-[#FFA06E]" },
                  { name: "Alex Rivera (Operations)", pct: 9, color: "bg-[#E0DCD6]" }
                ].map((s, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold text-[#333333]">
                      <span>{s.name}</span>
                      <span>{s.pct}%</span>
                    </div>
                    <div className="w-full bg-[#F5F2EE] rounded-full h-2 overflow-hidden">
                      <div className={`h-full ${s.color} rounded-full`} style={{ width: `${s.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'translate' && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-[#111111] mb-1">Real-Time Multi-Language Translation (40+ Languages)</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#EBE7E2] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#555555]">Original Audio (English)</span>
                    <span className="text-[10px] text-[#888888]">Live Stream</span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#222222] italic leading-relaxed">
                    "We have resolved the API gateway latency constraints and will begin rollout to enterprise beta users next week."
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-[#FFF8F5] border border-[#FFD9C7] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#FF6B35]">Live Translated (Japanese / 日本語)</span>
                    <span className="text-[10px] text-emerald-600 font-bold">180ms Latency</span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#111111] font-medium leading-relaxed">
                    「APIゲートウェイの遅延制約を解決しました。来週からエンタープライズのベータユーザーへの展開を開始します。」
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
