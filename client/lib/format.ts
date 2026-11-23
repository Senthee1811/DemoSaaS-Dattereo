/**
 * Timestamps arrive from the API as UTC ISO strings. They are shown in the viewer's own time
 * zone, and the exact UTC instant is kept for the tooltip so nothing is ambiguous.
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/** The UTC instant, for a `title` attribute. */
export function utcLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.toISOString().replace('T', ' ').slice(0, 19)} UTC`;
}
