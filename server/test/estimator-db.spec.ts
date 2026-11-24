import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { AuditService } from '../src/modules/audit/audit.service';

/**
 * Estimator accuracy report against real Postgres (percentile_cont ... FILTER, grouping, tenant scope).
 * Gated on TEST_DATABASE_URL: a THROWAWAY database with all migrations applied.
 */
const URL = process.env.TEST_DATABASE_URL;
const withDb = URL ? describe : describe.skip;
if (!URL) console.warn('[estimator-db.spec] TEST_DATABASE_URL not set: SKIPPED');

withDb('estimator accuracy report (real Postgres)', () => {
  let prisma: PrismaClient;
  let svc: AuditService;
  const orgA = randomUUID();
  const orgB = randomUUID();
  const pA = randomUUID();
  const pB = randomUUID();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: URL } } });
    svc = new AuditService(prisma as any);
    await prisma.organization.createMany({ data: [{ id: orgA, name: 'A', slug: `a-${orgA}` }, { id: orgB, name: 'B', slug: `b-${orgB}` }] });
    await prisma.project.createMany({ data: [{ id: pA, orgId: orgA, name: 'A', slug: 'a' }, { id: pB, orgId: orgB, name: 'B', slug: 'b' }] });
    const base = { latencyMs: 1, statusCode: 200, isBlocked: false, anomalyStatus: 'CLEAR', provider: 'OPENAI' as const, model: 'gpt-4o', estimatorVersion: 'v2', createdAt: new Date(Date.now() - 86_400_000) };
    const rows: any[] = [];
    // 10 confirmed rows: raw estimate 100 vs actual 100..., reserved = estimate * 1.1
    for (let i = 0; i < 10; i++) {
      const actual = 100 + i * 10; // 100..190
      rows.push({ ...base, id: `a-${i}`, projectId: pA, tokensIn: actual, tokensOut: 10, totalTokens: actual + 10, costEstimate: 0.01, estimatedInputTokens: 150, reservedInputTokens: 165, reservedOutputTokens: 200, usageStatus: 'CONFIRMED', reservationOverrunUsd: i === 9 ? 0.002 : 0 });
    }
    rows.push({ ...base, id: 'a-est', projectId: pA, tokensIn: 5, tokensOut: 5, totalTokens: 10, costEstimate: 0.5, estimatedInputTokens: 5, reservedInputTokens: 6, reservedOutputTokens: 5, usageStatus: 'ESTIMATED' }); // excluded: an estimate cannot validate an estimate
    rows.push({ ...base, id: 'a-legacy', projectId: pA, tokensIn: 5, tokensOut: 5, totalTokens: 10, costEstimate: 0.5 }); // legacy row: unknown, excluded
    rows.push({ ...base, id: 'b-0', projectId: pB, tokensIn: 1, tokensOut: 1, totalTokens: 2, costEstimate: 5, estimatedInputTokens: 1000, reservedInputTokens: 1100, reservedOutputTokens: 1, usageStatus: 'CONFIRMED' }); // another tenant
    await prisma.request.createMany({ data: rows });
  });
  afterAll(async () => {
    await prisma.request.deleteMany({ where: { projectId: { in: [pA, pB] } } });
    await prisma.project.deleteMany({ where: { id: { in: [pA, pB] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await prisma.$disconnect();
  });

  it('scores only provider-confirmed rows, reports the exclusions, and is scoped to the organization', async () => {
    const out = await svc.estimatorAccuracy(orgA, 30);
    expect(out.groups).toHaveLength(1);
    const g = out.groups[0];
    expect(g).toMatchObject({ provider: 'OPENAI', model: 'gpt-4o', estimatorVersion: 'v2', samples: 10, indicativeOnly: true });
    expect(g.excluded).toEqual({ estimatedUsage: 1, unscored: 1 });
    expect(out.groups.every((x: any) => x.samples === 10)).toBe(true); // org B's row (1 sample) is not mixed in
  });

  it('computes the under/over frequencies and ratios from the counts', async () => {
    const g = (await svc.estimatorAccuracy(orgA, 30)).groups[0];
    // raw estimate 150 vs actual 100..190: under when actual > 150 → 160,170,180,190 = 4/10; over when actual < 150 → 100..140 = 5/10
    expect(g.underestimatedPct).toBe(40);
    expect(g.overestimatedPct).toBe(50);
    // reserved 165: under-covered when actual > 165 → 170,180,190 = 3/10
    expect(g.reservationUnderCoveredInputPct).toBe(30);
    expect(g.estimateToActualRatio.p50).toBeCloseTo(150 / 145, 2); // median actual = 145
    expect(g.marginNeededForP99Coverage).toBeGreaterThan(1.2); // 190/150 = 1.267 at the top
    expect(g.financialOverrun).toEqual({ requests: 1, usd: 0.002, pctOfCost: 2 });
    expect(g.outputExceededReservePct).toBe(0);
  });

  it('with this little evidence the provider assessment says "insufficient data" and recommends no margin change', async () => {
    const out = await svc.estimatorAccuracy(orgA, 30);
    expect(out.providers[0]).toMatchObject({ provider: 'OPENAI', sufficient: false, verdict: 'insufficient_data', samples: 10 });
    expect(out.providers[0].note).toMatch(/Keep the current margin/);
  });

  it('another organization sees its own data only', async () => {
    const out = await svc.estimatorAccuracy(orgB, 30);
    expect(out.groups).toHaveLength(1);
    expect(out.groups[0].samples).toBe(1);
  });

  it('the report never reads prompt or response columns', async () => {
    const src = String(AuditService.prototype.estimatorAccuracy);
    expect(src).not.toMatch(/prompt_preview|response_preview|metadata_json/);
  });
});
