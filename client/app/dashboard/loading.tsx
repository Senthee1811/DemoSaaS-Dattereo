import { ViewSkeleton } from '@/components/ui/LoadingSkeleton';

/**
 * Shown while the dashboard route is being fetched during a client-side navigation (for example right after signing in). It
 * mirrors the real frame (a 16-rem sidebar on large screens, a 4-rem header) so the page does not jump when the dashboard
 * replaces it. It never appears on a direct page load: the dashboard's HTML is already complete.
 */
export default function DashboardLoading() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-subtle" data-testid="dashboard-loading">
      <aside className="hidden lg:block w-64 shrink-0 bg-surface border-r border-line" aria-hidden />
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-16 shrink-0 border-b border-line bg-surface" aria-hidden />
        <main className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-7xl mx-auto">
            <ViewSkeleton label="Loading your dashboard" />
          </div>
        </main>
      </div>
    </div>
  );
}
