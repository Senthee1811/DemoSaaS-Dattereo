import { ViewSkeleton } from '@/components/ui/LoadingSkeleton';

/** The detailed-usage page is rendered on demand; this shows while its route is fetched during a client navigation. */
export default function UsageLoading() {
  return (
    <div className="min-h-screen bg-surface-subtle px-6 py-6">
      <div className="max-w-7xl mx-auto">
        <ViewSkeleton label="Loading usage" />
      </div>
    </div>
  );
}
