import { describe, expect, it } from 'vitest';
import { auditFiltersFor, parseUsageRoute, usageHref, utcDayRange } from './usage-route';

const ID = '22222222-2222-4222-8222-222222222222';
const q = (s: string) => new URLSearchParams(s);

describe('usage route', () => {
  it('round-trips a daily target and a model target, for a project and for All projects', () => {
    for (const scope of ['', ID]) {
      for (const target of [
        { metric: 'daily', day: '2026-11-20' } as const,
        { metric: 'model', model: 'openai/gpt-oss-120b' } as const,
      ]) {
        const url = new URL(usageHref(scope, target), 'http://x');
        const segment = url.pathname.split('/')[2];
        expect(parseUsageRoute(segment, url.searchParams)).toEqual({ ok: true, scopeId: scope, target });
      }
    }
  });

  it('rejects a bad project segment, day, metric or model instead of querying with it', () => {
    expect(parseUsageRoute('not-a-uuid', q('metric=daily&range=2026-11-20')).ok).toBe(false);
    expect(parseUsageRoute('all', q('metric=daily&range=2026-13-40')).ok).toBe(false);
    expect(parseUsageRoute('all', q('metric=daily&range=2026-02-30')).ok).toBe(false);
    expect(parseUsageRoute('all', q('metric=daily')).ok).toBe(false);
    expect(parseUsageRoute('all', q('metric=model&model=')).ok).toBe(false);
    expect(parseUsageRoute('all', q(`metric=model&model=${'x'.repeat(201)}`)).ok).toBe(false);
    expect(parseUsageRoute('all', q('metric=other')).ok).toBe(false);
    expect(parseUsageRoute('%E0%A4%A', q('metric=daily&range=2026-11-20')).ok).toBe(false);
  });

  it('maps a target to audit filters: one whole UTC day, or one model', () => {
    expect(auditFiltersFor({ metric: 'daily', day: '2026-11-20' })).toEqual(utcDayRange('2026-11-20'));
    expect(utcDayRange('2026-11-20')).toEqual({
      startDate: '2026-11-20T00:00:00.000Z',
      endDate: '2026-11-20T23:59:59.999Z',
    });
    expect(auditFiltersFor({ metric: 'model', model: 'm' })).toEqual({ model: 'm' });
  });
});
