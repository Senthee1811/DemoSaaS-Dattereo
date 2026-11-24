'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { authFetch, readApiError } from '@/lib/auth-fetch';
import { formatDateTime } from '@/lib/format';
import { errorMessage } from '@/lib/types';
import { useScope } from '@/lib/scope';
import { Tip } from '@/components/ui/tooltip';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { InlineAlert } from '@/components/ui/feedback';
import type { NavTab } from '@/components/Sidebar';

/** One in-app notification, as returned by GET /api/v1/notifications/inbox. Everything is optional: never trust the shape. */
export interface InboxItem {
  id: string;
  eventType?: string;
  createdAt?: string;
  readAt?: string | null;
  title?: string;
  message?: string;
  severity?: string;
  projectId?: string;
}

interface InboxPage {
  unread?: number;
  items?: InboxItem[];
  nextCursor?: string | null;
}

const SEVERITY_TONE: Record<string, BadgeTone> = { critical: 'critical', warning: 'warning', info: 'info' };

/**
 * Where an item leads. Returns null when there is nowhere sensible to go, and `gone` when the item points at a
 * project that no longer exists (shown as plain text instead of a dead link).
 */
export function destinationFor(item: InboxItem, projectIds: string[] | null): { tab: NavTab; label: string } | { gone: string } | null {
  if (item.projectId && projectIds && !projectIds.includes(item.projectId)) return { gone: 'This project no longer exists.' };
  if (item.eventType === 'budget.alert') return { tab: 'alerts', label: 'View alerts' };
  if (item.eventType === 'recommendation.created') return { tab: 'insights', label: 'View recommendation' };
  return null;
}

/**
 * The header bell. The unread count is owned by the dashboard (one cheap counter request on its existing refresh
 * cycle); this component only loads the list when the panel is opened, so closed it costs nothing.
 */
export function NotificationInbox({ unread, onUnreadChange, onNavigate }: { unread: number; onUnreadChange: (n: number) => void; onNavigate: (tab: NavTab) => void }) {
  const { projects } = useScope();
  const projectIds = projects.length ? projects.map((p) => p.id) : null; // unknown until projects have loaded
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const load = useCallback(
    async (after?: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const res = await authFetch(`/api/v1/notifications/inbox?limit=20${after ? `&cursor=${encodeURIComponent(after)}` : ''}`);
        if (!res.ok) throw new Error(await readApiError(res, 'Could not load notifications.'));
        const page = (await res.json()) as InboxPage;
        const next = Array.isArray(page?.items) ? page.items.filter((i) => i && typeof i.id === 'string') : [];
        setItems((prev) => (after ? [...prev, ...next] : next));
        setCursor(typeof page?.nextCursor === 'string' ? page.nextCursor : null);
        if (typeof page?.unread === 'number') onUnreadChange(page.unread);
        setLoaded(true);
      } catch (err) {
        setError(errorMessage(err, 'Could not load notifications.'));
      } finally {
        setLoading(false);
      }
    },
    [onUnreadChange],
  );

  // The list is fetched when the panel opens (and refreshed each time it re-opens), from the click, not an effect
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void load(null);
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markRead = async (ids?: string[]) => {
    try {
      const res = await authFetch('/api/v1/notifications/inbox/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ids ? { ids } : {}) });
      if (!res.ok) throw new Error(await readApiError(res, 'Could not mark as read.'));
      const now = new Date().toISOString();
      setItems((prev) => prev.map((i) => (!ids || ids.includes(i.id) ? { ...i, readAt: i.readAt ?? now } : i)));
      // Re-read the authoritative count rather than doing arithmetic on possibly stale local state
      const c = await authFetch('/api/v1/notifications/inbox/unread-count');
      if (c.ok) {
        const body = (await c.json()) as { unread?: number };
        if (typeof body?.unread === 'number') onUnreadChange(body.unread);
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not mark as read.'));
    }
  };

  const unreadLabel = unread > 99 ? '99+' : String(unread);

  return (
    <div className="relative">
      <Tip label="Notifications">
        <button
          ref={buttonRef}
          type="button"
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          className="relative p-2 text-fg-secondary hover:text-fg hover:bg-surface-muted rounded-full border border-line transition-colors"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        >
          <Bell className="w-4 h-4" />
          {unread > 0 && (
            <span data-testid="inbox-badge" className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-micro font-bold flex items-center justify-center">
              {unreadLabel}
            </span>
          )}
        </button>
      </Tip>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 mt-2 w-[min(24rem,calc(100vw-2rem))] max-h-[28rem] flex flex-col rounded-menu border border-line bg-surface shadow-lg z-40"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-line">
            <h2 className="text-sm font-semibold text-fg">Notifications</h2>
            <button
              type="button"
              onClick={() => void markRead()}
              disabled={unread === 0}
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline disabled:text-fg-muted disabled:no-underline disabled:cursor-not-allowed rounded-control focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Check className="w-3 h-3" /> Mark all as read
            </button>
          </div>

          <div className="overflow-y-auto flex-1">
            {error && (
              <div className="p-3">
                <InlineAlert variant="error" title="Notifications unavailable">
                  {error}{' '}
                  <button type="button" className="underline" onClick={() => void load(null)}>Retry</button>
                </InlineAlert>
              </div>
            )}
            {loading && !loaded && <p className="p-4 text-xs text-fg-muted" role="status">Loading…</p>}
            {loaded && !error && items.length === 0 && <p className="p-6 text-center text-xs text-fg-muted">You&apos;re all caught up. Budget alerts and new recommendations will appear here.</p>}

            <ul>
              {items.map((item) => {
                const dest = destinationFor(item, projectIds);
                const isUnread = !item.readAt;
                const go = dest && 'tab' in dest ? dest : null;
                return (
                  <li key={item.id} data-testid="inbox-item" data-unread={isUnread} className={`px-3 py-2.5 border-b border-line last:border-0 ${isUnread ? 'bg-accent-subtle/40' : ''}`}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge tone={SEVERITY_TONE[item.severity ?? ''] ?? 'neutral'}>{item.severity ?? 'info'}</Badge>
                      <span className="text-caption text-fg-muted">{item.createdAt ? formatDateTime(item.createdAt) : ''}</span>
                      {isUnread && <span className="ml-auto h-2 w-2 rounded-full bg-accent" aria-label="Unread" />}
                    </div>
                    <p className="text-xs font-medium text-fg">{item.title ?? 'Notification'}</p>
                    {item.message && <p className="text-xs text-fg-secondary line-clamp-2">{item.message}</p>}
                    <div className="mt-1 flex items-center gap-3 text-caption">
                      {go && (
                        <button
                          type="button"
                          className="text-accent hover:underline rounded-control focus-visible:outline-2 focus-visible:outline-accent"
                          onClick={() => {
                            if (isUnread) void markRead([item.id]);
                            setOpen(false);
                            onNavigate(go.tab);
                          }}
                        >
                          {go.label}
                        </button>
                      )}
                      {dest && 'gone' in dest && <span className="text-fg-muted">{dest.gone}</span>}
                      {isUnread && (
                        <button type="button" className="text-fg-secondary hover:underline rounded-control focus-visible:outline-2 focus-visible:outline-accent" onClick={() => void markRead([item.id])}>
                          Mark as read
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {cursor && (
              <div className="p-2 text-center">
                <button type="button" disabled={loading} onClick={() => void load(cursor)} className="text-xs text-accent hover:underline disabled:text-fg-muted">
                  {loading ? 'Loading…' : 'Load older'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
