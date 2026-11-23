/**
 * The detailed-usage route that both dashboard charts navigate to:
 *
 *   /projects/{projectId | all}/usage?metric=daily&range=2026-11-20   (spend-over-time: one UTC day)
 *   /projects/{projectId | all}/usage?metric=model&model=gpt-4o       (cost-by-model: one model)
 *
 * The project segment is the global Scope at the moment of the click ("all" = All projects), so
 * the detail page never asks for a second project choice. Everything here is pure, so the same
 * code builds the link on the chart and validates it on the page.
 */

export const ALL_PROJECTS_SEGMENT = 'all';

export type UsageTarget = { metric: 'daily'; day: string } | { metric: 'model'; model: string };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_MODEL_LENGTH = 200;

export function isValidUtcDay(day: string): boolean {
  if (!DAY_RE.test(day)) return false;
  const d = new Date(`${day}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

/** A UTC day ("YYYY-MM-DD") as an inclusive range for the audit API. Chart buckets are UTC days. */
export function utcDayRange(day: string): { startDate: string; endDate: string } {
  return { startDate: `${day}T00:00:00.000Z`, endDate: `${day}T23:59:59.999Z` };
}

export function usageHref(scopeId: string, target: UsageTarget): string {
  const segment = scopeId ? encodeURIComponent(scopeId) : ALL_PROJECTS_SEGMENT;
  const qs = new URLSearchParams(
    target.metric === 'daily' ? { metric: 'daily', range: target.day } : { metric: 'model', model: target.model },
  );
  return `/projects/${segment}/usage?${qs.toString()}`;
}

export type ParsedUsageRoute =
  | { ok: true; scopeId: string; target: UsageTarget }
  | { ok: false; message: string };

export function parseUsageRoute(projectSegment: string, search: URLSearchParams): ParsedUsageRoute {
  let segment = projectSegment;
  try {
    segment = decodeURIComponent(projectSegment);
  } catch {
    return { ok: false, message: 'This usage link is not valid.' };
  }
  if (segment !== ALL_PROJECTS_SEGMENT && !UUID_RE.test(segment)) {
    return { ok: false, message: 'This usage link does not point at a project.' };
  }
  const scopeId = segment === ALL_PROJECTS_SEGMENT ? '' : segment;

  const metric = search.get('metric');
  if (metric === 'daily') {
    const day = search.get('range') ?? '';
    if (!isValidUtcDay(day)) return { ok: false, message: 'This usage link has no valid day (expected YYYY-MM-DD).' };
    return { ok: true, scopeId, target: { metric: 'daily', day } };
  }
  if (metric === 'model') {
    const model = (search.get('model') ?? '').trim();
    if (!model || model.length > MAX_MODEL_LENGTH) return { ok: false, message: 'This usage link has no valid model.' };
    return { ok: true, scopeId, target: { metric: 'model', model } };
  }
  return { ok: false, message: 'This usage link is missing which chart it came from.' };
}

/** Audit API filters for a target (the project filter is added separately from the scope). */
export function auditFiltersFor(target: UsageTarget): Record<string, string> {
  return target.metric === 'daily' ? utcDayRange(target.day) : { model: target.model };
}
