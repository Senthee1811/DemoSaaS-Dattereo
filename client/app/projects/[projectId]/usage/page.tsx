'use client';

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useHydrated, useLocalStorageValue } from '@/lib/client-storage';
import { parseUsageRoute } from '@/lib/usage-route';
import { UsageDetailView } from '@/components/usage/UsageDetailView';
import { InlineAlert } from '@/components/ui/feedback';

function UsagePageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const params = useParams<{ projectId: string }>();
  const hydrated = useHydrated();
  const token = useLocalStorageValue('spendguard_token');

  // Same gate as the dashboard: no session, no data. Come back here after signing in.
  useEffect(() => {
    if (hydrated && !token) {
      const next = `${pathname}${search.toString() ? `?${search.toString()}` : ''}`;
      router.push(`/login?required=true&next=${encodeURIComponent(next)}`);
    }
  }, [hydrated, token, router, pathname, search]);

  if (!hydrated || !token) return <Loading />;

  const parsed = parseUsageRoute(String(params?.projectId ?? ''), new URLSearchParams(search.toString()));
  if (!parsed.ok) {
    return (
      <div className="min-h-screen bg-surface-subtle px-6 py-10">
        <div className="max-w-xl mx-auto space-y-4">
          <InlineAlert variant="error" title="This usage page can't be opened">
            {parsed.message}
          </InlineAlert>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface hover:bg-surface-muted border border-line text-xs font-semibold text-fg"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
            <span>Back to dashboard</span>
          </Link>
        </div>
      </div>
    );
  }

  // Keyed so a different bucket or project starts clean (no previous rows flashing)
  return <UsageDetailView key={`${parsed.scopeId}|${JSON.stringify(parsed.target)}`} scopeId={parsed.scopeId} target={parsed.target} />;
}

function Loading() {
  return (
    <div className="min-h-screen bg-surface-subtle flex items-center justify-center text-xs text-fg-secondary gap-2" role="status">
      <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
      <span>Loading…</span>
    </div>
  );
}

export default function UsagePage() {
  return (
    <Suspense fallback={<Loading />}>
      <UsagePageContent />
    </Suspense>
  );
}
