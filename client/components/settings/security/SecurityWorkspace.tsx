'use client';

import React, { useCallback, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { SecurityOverview } from './SecurityOverview';
import { PasswordCard } from './PasswordCard';
import { SessionsCard } from './SessionsCard';
import { ActivityCard } from './ActivityCard';
import type { SecurityOverviewData, SessionsData } from './types';

/**
 * Security & Authentication: four sections, each backed by a real endpoint
 * (overview, password + MFA status, active sessions, security activity). One column on a phone,
 * two on tablet and desktop, with the overview and activity spanning the full width.
 */
export function SecurityWorkspace() {
  const overview = useApi<SecurityOverviewData>('/api/auth/security');
  const sessions = useApi<SessionsData>('/api/auth/sessions');
  const [activityKey, setActivityKey] = useState(0);

  // After a password change or a session change, every section that reflects it reloads together
  const refreshAll = useCallback(() => {
    overview.reload();
    sessions.reload();
    setActivityKey((k) => k + 1);
  }, [overview, sessions]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-lg font-normal text-fg tracking-tight">Security & Authentication</h2>
        <p className="text-xs text-fg-secondary">Manage how you sign in, where you are signed in, and what has happened on your account.</p>
      </div>

      <SecurityOverview data={overview.data} loading={overview.loading} error={overview.error} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
        <PasswordCard overview={overview.data} onChanged={refreshAll} />
        <SessionsCard data={sessions.data} loading={sessions.loading} error={sessions.error} onChanged={refreshAll} />
      </div>

      <ActivityCard reloadKey={activityKey} />
    </div>
  );
}
