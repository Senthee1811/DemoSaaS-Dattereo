import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { splitWindow } from '../src/modules/insights/rollup.window';
import { RollupService } from '../src/modules/insights/rollup.service';
import { InsightsDataService } from '../src/modules/insights/insights.data';

const D = (s: string) => new Date(s);
const iso = (x: { from: Date; to: Date } | null) => (x ? [x.from.toISOString(), x.to.toISOString()] : null);

describe('splitWindow: the rollup answers whole materialised days, the ledger answers the edges', () => {
  const through = D('2026-11-20T00:00:00Z'); // 2026-11-20 is the last materialised day

  it('a midnight-aligned window inside the watermark is served entirely by the rollup', () => {
    const s = splitWindow(D('2026-11-10T00:00:00Z'), D('2026-11-15T00:00:00Z'), through);
    expect(iso(s.rollup)).toEqual(['2026-11-10T00:00:00.000Z', '2026-11-15T00:00:00.000Z']);
    expect(s.raw).toEqual([]);
  });
  it('partial days at both edges come from the ledger; the whole days in between from the rollup; together they tile the window', () => {
    const from = D('2026-11-10T06:30:00Z');
    const to = D('2026-11-15T09:00:00Z');
    const s = splitWindow(from, to, through);
    expect(iso(s.rollup)).toEqual(['2026-11-11T00:00:00.000Z', '2026-11-15T00:00:00.000Z']);
    expect(s.raw.map(iso)).toEqual([['2026-11-10T06:30:00.000Z', '2026-11-11T00:00:00.000Z'], ['2026-11-15T00:00:00.000Z', '2026-11-15T09:00:00.000Z']]);
  });
  it('days after the watermark (and today) are never taken from the rollup', () => {
    const s = splitWindow(D('2026-11-18T00:00:00Z'), D('2026-11-25T12:00:00Z'), through);
    expect(iso(s.rollup)).toEqual(['2026-11-18T00:00:00.000Z', '2026-11-21T00:00:00.000Z']);
    expect(s.raw.map(iso)).toEqual([['2026-11-21T00:00:00.000Z', '2026-11-25T12:00:00.000Z']]);
  });
  it('a window entirely newer than the watermark is all ledger', () => {
    const s = splitWindow(D('2026-11-22T00:00:00Z'), D('2026-11-24T00:00:00Z'), through);
    expect(s.rollup).toBeNull();
    expect(s.raw.map(iso)).toEqual([['2026-11-22T00:00:00.000Z', '2026-11-24T00:00:00.000Z']]);
  });
  it('a window shorter than a day, or one that crosses no full day, is all ledger', () => {
    expect(splitWindow(D('2026-11-10T01:00:00Z'), D('2026-11-10T23:00:00Z'), through).rollup).toBeNull();
    expect(splitWindow(D('2026-11-10T23:00:00Z'), D('2026-11-11T01:00:00Z'), through).rollup).toBeNull();
  });
  it('no watermark (rollup off or empty) means everything is read from the ledger', () => {
    const s = splitWindow(D('2026-11-10T00:00:00Z'), D('2026-11-15T00:00:00Z'), null);
    expect(s.rollup).toBeNull();
    expect(s.raw.map(iso)).toEqual([['2026-11-10T00:00:00.000Z', '2026-11-15T00:00:00.000Z']]);
  });
  it('an empty or inverted window yields nothing', () => {
    expect(splitWindow(D('2026-11-10T00:00:00Z'), D('2026-11-10T00:00:00Z'), through)).toEqual({ rollup: null, raw: [] });
    expect(splitWindow(D('2026-11-11T00:00:00Z'), D('2026-11-10T00:00:00Z'), through)).toEqual({ rollup: null, raw: [] });
  });
  it('property: for 2,000 random windows the pieces tile [from, to) exactly, with no gap and no overlap, and the rollup never reaches past the watermark', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let i = 0; i < 2000; i++) {
      const from = new Date(D('2026-10-01T00:00:00Z').getTime() + Math.floor(rnd() * 50 * 86_400_000));
      const to = new Date(from.getTime() + Math.floor(rnd() * 20 * 86_400_000) + 1);
      const wm = rnd() < 0.1 ? null : new Date(D('2026-10-05T00:00:00Z').getTime() + Math.floor(rnd() * 40) * 86_400_000);
      const s = splitWindow(from, to, wm);
      const pieces = [...(s.rollup ? [s.rollup] : []), ...s.raw].sort((a, b) => a.from.getTime() - b.from.getTime());
      expect(pieces[0].from.getTime()).toBe(from.getTime());
      expect(pieces[pieces.length - 1].to.getTime()).toBe(to.getTime());
      for (let k = 1; k < pieces.length; k++) expect(pieces[k].from.getTime()).toBe(pieces[k - 1].to.getTime());
      if (s.rollup) {
        expect(s.rollup.from.getTime() % 86_400_000).toBe(0);
        expect(s.rollup.to.getTime() % 86_400_000).toBe(0);
        expect(s.rollup.to.getTime()).toBeLessThanOrEqual((wm as Date).getTime() + 86_400_000);
      }
    }
  });
});

/**
 * Real Postgres: the rollup must give EXACTLY the numbers the ledger gives. Gated on TEST_DATABASE_URL (a THROWAWAY
 * database with all migrations applied).
 */
// This suite TRUNCATEs requests/projects/organizations, so it also needs an explicit TEST_DATABASE_THROWAWAY=1 declaration
const URL = process.env.TEST_DATABASE_THROWAWAY === '1' ? process.env.TEST_DATABASE_URL : undefined;
const withDb = URL ? describe : describe.skip;
if (!URL) console.warn('[rollup.spec] needs TEST_DATABASE_URL + TEST_DATABASE_THROWAWAY=1 (it truncates tables): the real-Postgres equivalence suite is SKIPPED');

withDb('rollup equals the ledger (real Postgres)', () => {
  let prisma: PrismaClient;
  let rollup: RollupService;
  let withRollup: InsightsDataService;
  let ledgerOnly: InsightsDataService;
  const orgA = randomUUID();
  const orgB = randomUUID();
  const projA = randomUUID();
  const projA2 = randomUUID();
  const projB = randomUUID();
  const key1 = randomUUID();
  const NOW = new Date('2026-11-25T15:30:00Z');
  const dayOf = (n: number, h = 12) => new Date(Date.UTC(2026, 10, 25 - n, h, 17, 3));

  beforeAll(async () => {
    process.env.INSIGHTS_ROLLUPS = 'on';
    prisma = new PrismaClient({ datasources: { db: { url: URL } } });
    await prisma.$executeRawUnsafe('TRUNCATE request_daily_rollups, rollup_state, requests, gateway_api_keys, projects, organizations CASCADE');
    await prisma.organization.createMany({ data: [{ id: orgA, name: 'A', slug: `a-${orgA}` }, { id: orgB, name: 'B', slug: `b-${orgB}` }] });
    await prisma.project.createMany({ data: [{ id: projA, orgId: orgA, name: 'A1', slug: 'a1' }, { id: projA2, orgId: orgA, name: 'A2', slug: 'a2' }, { id: projB, orgId: orgB, name: 'B1', slug: 'b1' }] });
    await prisma.gatewayApiKey.create({ data: { id: key1, projectId: projA, keyName: 'k', keyPrefix: 'sg', hashedSecret: `h-${key1}` } });
    // A deterministic ledger over 12 days with NULL attribution, blocked rows, a key, two orgs, two providers, cached tokens
    const rows: any[] = [];
    let n = 0;
    for (let d = 0; d < 12; d++) {
      for (let i = 0; i < 9; i++) {
        n++;
        const project = i % 3 === 0 ? projA2 : projA;
        rows.push({
          id: `r${n}`, projectId: project, gatewayKeyId: i % 4 === 0 && project === projA ? key1 : null, provider: i % 2 ? 'OPENAI' : 'ANTHROPIC', model: i % 2 ? 'gpt-4o' : 'claude-sonnet-5-5',
          tokensIn: 100 + n, tokensOut: 20 + (n % 7), totalTokens: 120 + n + (n % 7), costEstimate: Number((0.001 * n + 0.000123).toFixed(6)), latencyMs: 100, statusCode: i === 8 ? 429 : 200,
          isBlocked: i === 8, anomalyStatus: i === 8 ? 'SKIPPED' : 'CLEAR', application: i % 3 === 1 ? 'support-bot' : null, team: i % 5 === 0 ? 'growth' : null,
          cachedTokensIn: i % 2 ? 10 : null, createdAt: dayOf(d, 1 + ((i * 3) % 22)),
        });
      }
    }
    rows.push({ id: 'other-org', projectId: projB, provider: 'OPENAI', model: 'gpt-4o', tokensIn: 999, tokensOut: 999, totalTokens: 1998, costEstimate: 99.5, latencyMs: 1, statusCode: 200, isBlocked: false, anomalyStatus: 'CLEAR', createdAt: dayOf(3) });
    await prisma.request.createMany({ data: rows });
    rollup = new RollupService(prisma as any);
    withRollup = new InsightsDataService(prisma as any, rollup);
    ledgerOnly = new InsightsDataService(prisma as any); // no rollup: the reference answer
    await rollup.build(NOW);
  });
  afterAll(async () => {
    delete process.env.INSIGHTS_ROLLUPS;
    await prisma.$executeRawUnsafe('TRUNCATE request_daily_rollups, rollup_state, requests, gateway_api_keys, projects, organizations CASCADE');
    await prisma.$disconnect();
  });

  const windows: Array<[string, Date, Date]> = [
    ['whole days inside the watermark', new Date('2026-11-16T00:00:00Z'), new Date('2026-11-22T00:00:00Z')],
    ['partial first and last day', new Date('2026-11-16T07:41:00Z'), new Date('2026-11-23T13:13:00Z')],
    ['reaching into today (not materialised)', new Date('2026-11-20T00:00:00Z'), NOW],
    ['all history', new Date('2026-11-01T00:00:00Z'), NOW],
    ['a sub-day window', new Date('2026-11-24T02:00:00Z'), new Date('2026-11-24T20:00:00Z')],
  ];

  it('the rollup was built, excludes blocked rows and keeps organizations apart', async () => {
    const st = await rollup.status();
    expect(st.completeThrough).toBe('2026-11-24');
    const rows = await prisma.requestDailyRollup.findMany({ where: { orgId: orgA } });
    // 9 rows per day minus 1 blocked, for the 11 COMPLETE days; today (day 0) is not materialised yet
    expect(rows.reduce((a, r) => a + r.requests, 0)).toBe(11 * 8);
    expect(rows.every((r) => r.orgId === orgA)).toBe(true);
    expect((await prisma.requestDailyRollup.findMany({ where: { orgId: orgB } })).length).toBe(1);
  });

  for (const dim of ['model', 'provider', 'application', 'team', 'key', 'project'] as const) {
    it.each(windows)(`members by ${dim}: ${'%s'} → identical to the ledger`, async (_n, from, to) => {
      const norm = (xs: any[]) => xs.map((x) => ({ ...x, costUsd: Number(x.costUsd.toFixed(6)) })).sort((a, b) => String(a.key).localeCompare(String(b.key)));
      expect(norm(await withRollup.members(orgA, undefined, from, to, dim))).toEqual(norm(await ledgerOnly.members(orgA, undefined, from, to, dim)));
      expect(norm(await withRollup.members(orgA, projA, from, to, dim))).toEqual(norm(await ledgerOnly.members(orgA, projA, from, to, dim)));
    });
  }

  it.each(windows)('totals: %s → identical to the ledger (to the micro-dollar)', async (_n, from, to) => {
    const a = await withRollup.totals(orgA, undefined, from, to);
    const b = await ledgerOnly.totals(orgA, undefined, from, to);
    expect({ ...a, costUsd: Number(a.costUsd.toFixed(6)) }).toEqual({ ...b, costUsd: Number(b.costUsd.toFixed(6)) });
  });

  it.each(windows)('daily spend and first activity: %s → identical to the ledger', async (_n, from, to) => {
    const norm = (xs: Array<{ date: string; spendUsd: number }>) => xs.map((x) => ({ date: x.date, spendUsd: Number(x.spendUsd.toFixed(6)) }));
    expect(norm(await withRollup.dailySpend(orgA, undefined, from, to))).toEqual(norm(await ledgerOnly.dailySpend(orgA, undefined, from, to)));
    expect(await withRollup.firstActivityDate(orgA)).toBe(await ledgerOnly.firstActivityDate(orgA));
    expect(await withRollup.firstActivityDate(orgA, projA2)).toBe(await ledgerOnly.firstActivityDate(orgA, projA2));
  });

  it('organization isolation: the rollup path never returns another organization\'s spend', async () => {
    const t = await withRollup.totals(orgA, undefined, new Date('2026-11-01T00:00:00Z'), NOW);
    expect(t.costUsd).toBeLessThan(90); // orgB's single $99.50 row is not in A's numbers
    const b = await withRollup.totals(orgB, undefined, new Date('2026-11-01T00:00:00Z'), NOW);
    expect(b.requests).toBe(1);
    expect(b.costUsd).toBeCloseTo(99.5, 6);
  });

  it('rebuilding is idempotent: the same rows, the same totals', async () => {
    const before = await prisma.requestDailyRollup.count();
    await rollup.rebuildDay('2026-11-20');
    await rollup.rebuildDay('2026-11-20');
    expect(await prisma.requestDailyRollup.count()).toBe(before);
    const a = await withRollup.totals(orgA, undefined, new Date('2026-11-01T00:00:00Z'), NOW);
    const b = await ledgerOnly.totals(orgA, undefined, new Date('2026-11-01T00:00:00Z'), NOW);
    expect(a.costUsd).toBeCloseTo(b.costUsd, 6);
  });

  it('LATE ARRIVAL into an already-summarised day is detected by reconciliation, reported, repaired, and then exact again', async () => {
    await prisma.request.create({ data: { id: 'late-1', projectId: projA, provider: 'OPENAI', model: 'gpt-4o', tokensIn: 5000, tokensOut: 500, totalTokens: 5500, costEstimate: 12.345678, latencyMs: 1, statusCode: 200, isBlocked: false, anomalyStatus: 'CLEAR', createdAt: dayOf(6, 9) } });
    const w: [Date, Date] = [new Date('2026-11-01T00:00:00Z'), NOW];
    const stale = await withRollup.totals(orgA, undefined, ...w);
    const truth = await ledgerOnly.totals(orgA, undefined, ...w);
    expect(truth.costUsd - stale.costUsd).toBeCloseTo(12.345678, 5); // the rollup is behind until it is repaired (and we know it)
    const report = await rollup.reconcile(NOW);
    expect(report.discrepancies.map((d) => d.day)).toContain('2026-11-19');
    expect(report.repaired).toBeGreaterThanOrEqual(1);
    const fixed = await withRollup.totals(orgA, undefined, ...w);
    expect(fixed.costUsd).toBeCloseTo(truth.costUsd, 6);
    expect(fixed.requests).toBe(truth.requests);
    expect((await rollup.status()).lastDiscrepancies).toBeGreaterThanOrEqual(1);
    const clean = await rollup.reconcile(NOW);
    expect(clean.discrepancies).toHaveLength(0); // and the next run is clean
  });

  it('a late row inside the recheck window is absorbed by the normal build with no discrepancy', async () => {
    await prisma.request.create({ data: { id: 'late-2', projectId: projA, provider: 'OPENAI', model: 'gpt-4o', tokensIn: 10, tokensOut: 10, totalTokens: 20, costEstimate: 1.5, latencyMs: 1, statusCode: 200, isBlocked: false, anomalyStatus: 'CLEAR', createdAt: dayOf(1, 8) } });
    await rollup.build(NOW);
    const clean = await rollup.reconcile(NOW);
    expect(clean.discrepancies).toHaveLength(0);
  });

  it('the rollup is disposable: dropping it falls back to the ledger with identical answers', async () => {
    const w: [Date, Date] = [new Date('2026-11-01T00:00:00Z'), NOW];
    const withIt = await withRollup.totals(orgA, undefined, ...w);
    await prisma.$executeRawUnsafe('TRUNCATE request_daily_rollups, rollup_state');
    rollup.invalidate();
    const without = await withRollup.totals(orgA, undefined, ...w);
    expect(without.costUsd).toBeCloseTo(withIt.costUsd, 6);
    expect(without.requests).toBe(withIt.requests);
    await rollup.build(NOW); // and it rebuilds from the ledger
    expect((await rollup.status()).completeThrough).toBe('2026-11-24');
  });

  it('with INSIGHTS_ROLLUPS off the service never reads the rollup table', async () => {
    delete process.env.INSIGHTS_ROLLUPS;
    rollup.invalidate();
    expect(await rollup.completeThrough()).toBeNull();
    process.env.INSIGHTS_ROLLUPS = 'on';
    rollup.invalidate();
  });
});
