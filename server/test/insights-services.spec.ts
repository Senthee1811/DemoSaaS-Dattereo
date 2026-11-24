import 'reflect-metadata';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AttributionService, parseRange } from '../src/modules/insights/attribution.service';
import { InvestigationService } from '../src/modules/insights/investigation.service';
import { ForecastService } from '../src/modules/insights/forecast.service';
import { ModelComparisonService } from '../src/modules/insights/model-comparison.service';
import { RecommendationsService } from '../src/modules/insights/recommendations.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import { MemberTotals, Totals } from '../src/modules/insights/calc/investigation.calc';
import { UsageGroup } from '../src/modules/insights/calc/comparison.calc';
import { RecommendationDraft } from '../src/modules/insights/calc/recommendation.rules';
import { matches, Row } from './helpers/fakes';

const NOW = new Date('2026-11-15T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T = (requests: number, tokens: number, costUsd: number): Totals => ({ requests, tokensIn: tokens * 0.7, tokensOut: tokens * 0.3, costUsd });

/** A stand-in for the ledger queries that records every organization it was asked about. */
class FakeData {
  orgsSeen: string[] = [];
  projects = [{ id: 'p1', orgId: 'org-a', name: 'Support', budgetMonthly: 100 }, { id: 'p2', orgId: 'org-b', name: 'Other', budgetMonthly: 50 }];
  totalsByWindow: (from: Date) => Totals = () => T(0, 0, 0);
  membersByDim: Record<string, { window: MemberTotals[]; baseline: MemberTotals[] }> = {};
  daily: Array<{ date: string; spendUsd: number }> = [];
  first: string | null = '2026-11-01';
  buckets: any[] = [];
  evidence = (dim?: string, key?: string | null) => [{ id: `req_${dim ?? 'top'}_${key ?? 'x'}`, at: '2026-11-15T10:00:00Z', projectId: 'p1', model: 'gpt-4o', provider: 'OPENAI', gatewayKeyId: null, application: null, team: null, tokensIn: 100, tokensOut: 50, costUsd: 1.5, reservationOverrunUsd: 0, anomalyStatus: 'CLEAR' }];
  usage: UsageGroup[] = [];
  providers = new Set<string>();

  async assertScope(orgId: string, projectId?: string) {
    this.orgsSeen.push(orgId);
    if (!projectId) return null;
    const p = this.projects.find((x) => x.id === projectId && x.orgId === orgId);
    if (!p) throw new NotFoundException('Project not found');
    return p;
  }
  async totals(orgId: string, _p: string | undefined, from: Date) { this.orgsSeen.push(orgId); return this.totalsByWindow(from); }
  async dailySpend(orgId: string) { this.orgsSeen.push(orgId); return this.daily; }
  async firstActivityDate(orgId: string) { this.orgsSeen.push(orgId); return this.first; }
  async bucketSeries(orgId: string) { this.orgsSeen.push(orgId); return this.buckets; }
  async members(orgId: string, _p: string | undefined, from: Date, _to: Date, dim: string) {
    this.orgsSeen.push(orgId);
    const m = this.membersByDim[dim] ?? { window: [], baseline: [] };
    return from.getTime() >= NOW.getTime() - DAY - 1000 ? m.window : m.baseline;
  }
  /** Same contract as InsightsDataService.summary: totals + members for several dimensions in one call. */
  async summary(orgId: string, p: string | undefined, from: Date, to: Date, dims: string[]) {
    const members: Record<string, MemberTotals[]> = {};
    for (const d of dims) members[d] = await this.members(orgId, p, from, to, d);
    return { totals: await this.totals(orgId, p, from), members };
  }
  async evidenceRequests(orgId: string, _p: string | undefined, _f: Date, _t: Date, o: any = {}) { this.orgsSeen.push(orgId); return o.anomaliesOnly ? [] : this.evidence(o.dimension, o.key); }
  async modelUsage(orgId: string) { this.orgsSeen.push(orgId); return { groups: this.usage, rowsWithCacheData: 0, totalRows: this.usage.reduce((a, g) => a + g.requests, 0) }; }
  async providersWithKeys(orgId: string) { this.orgsSeen.push(orgId); return this.providers; }
}

const member = (key: string | null, requests: number, tokens: number, costUsd: number, label = key ?? 'Unattributed'): MemberTotals => ({ key, label, requests, tokensIn: tokens * 0.7, tokensOut: tokens * 0.3, costUsd });

describe('attribution service', () => {
  it('reports unattributed spend as its own row with the coverage share, never spreading it over tagged rows', async () => {
    const data = new FakeData();
    data.totalsByWindow = () => T(300, 300_000, 100);
    const apps = [member('support-bot', 100, 100_000, 60), member(null, 200, 200_000, 40)];
    data.membersByDim.application = { window: apps, baseline: apps };
    const out = await new AttributionService(data as any).attribute('org-a', { dimension: 'application', from: '2026-11-01T00:00:00Z', to: '2026-11-15T00:00:00Z' });
    expect(out.rows.map((r) => [r.label, r.costUsd, r.share, r.unattributed])).toEqual([['support-bot', 60, 0.6, false], ['Unattributed', 40, 0.4, true]]);
    expect(out.coverage).toMatchObject({ attributedShare: 0.6, unattributedUsd: 40 });
    expect(out.coverage.note).toMatch(/never allocated/);
    expect(out.howToAttribute!.precedence).toMatch(/key wins over a header/);
    expect(out.rows[0]).toMatchObject({ tokensPerRequest: 1000, costPerRequestUsd: 0.6 });
  });

  it('shares sum to 1 and the totals match the ledger aggregate', async () => {
    const data = new FakeData();
    data.totalsByWindow = () => T(60, 60_000, 90);
    const models = [member('a', 10, 10_000, 30), member('b', 20, 20_000, 30), member('c', 30, 30_000, 30)];
    data.membersByDim.model = { window: models, baseline: models };
    const out = await new AttributionService(data as any).attribute('org-a', { dimension: 'model' });
    expect(out.rows.reduce((s, r) => s + r.costUsd, 0)).toBeCloseTo(out.totals.costUsd, 6);
    expect(out.rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 3);
    expect(out.howToAttribute).toBeNull(); // only offered where tagging applies
  });

  it('rejects unknown dimensions (no free-form column names reach a query) and bad ranges', async () => {
    const svc = new AttributionService(new FakeData() as any);
    await expect(svc.attribute('org-a', { dimension: 'password_hash; DROP TABLE requests' })).rejects.toBeInstanceOf(BadRequestException);
    expect(() => parseRange('garbage', undefined)).toThrow(/ISO 8601/);
    expect(() => parseRange('2026-11-10T00:00:00Z', '2026-11-01T00:00:00Z')).toThrow(/before/);
    expect(() => parseRange('2026-01-01T00:00:00Z', '2026-11-01T00:00:00Z')).toThrow(/92 days/);
  });

  it('a project of another tenant is a 404 and no ledger query runs for it', async () => {
    const data = new FakeData();
    await expect(new AttributionService(data as any).attribute('org-a', { dimension: 'model', projectId: 'p2' })).rejects.toBeInstanceOf(NotFoundException);
    expect(data.orgsSeen).toEqual(['org-a']); // only the scope check
  });
});

describe('investigation service: every statement is tied to ledger records', () => {
  function scenario() {
    const data = new FakeData();
    const windowFrom = NOW.getTime() - DAY;
    // baseline: 7 days × 100 requests/day, 1,000 tokens each, $10/day ($0.0001/token). Window: 300 requests of the same size
    // (3× the traffic) at $60 → $0.0002/token, i.e. the traffic also moved to a pricier model.
    data.totalsByWindow = (from) => (from.getTime() >= windowFrom - 1000 ? T(300, 300_000, 60) : T(700, 700_000, 70));
    data.membersByDim.model = { window: [member('gpt-4o', 200, 200_000, 55), member('gpt-4o-mini', 100, 100_000, 5)], baseline: [member('gpt-4o-mini', 700, 700_000, 70)] };
    data.membersByDim.key = { window: [member('key-1', 300, 300_000, 60, 'Prod (sg_live_ab…)')], baseline: [member('key-1', 700, 700_000, 70, 'Prod (sg_live_ab…)')] };
    data.membersByDim.application = { window: [member(null, 300, 300_000, 60)], baseline: [member(null, 700, 700_000, 70)] };
    data.membersByDim.team = { window: [], baseline: [] };
    data.daily = Array.from({ length: 7 }, (_, i) => ({ date: new Date(NOW.getTime() - (8 - i) * DAY).toISOString().slice(0, 10), spendUsd: 10 }));
    const svc = new InvestigationService(data as any);
    return { data, svc };
  }

  it('answers what/when/which with numbers from the ledger aggregates', async () => {
    const { svc } = scenario();
    const r = await svc.investigate('org-a', { projectId: 'p1' }, NOW);
    expect(r.scope).toEqual({ projectId: 'p1', projectName: 'Support' });
    expect(r.decomposition.status).toBe('ok');
    expect(r.decomposition.baselineSpendUsd).toBeCloseTo(10, 6); // 7-day baseline scaled to the 1-day window
    expect(r.decomposition.windowSpendUsd).toBe(60);
    expect(r.decomposition.deltaUsd).toBeCloseTo(50, 6);
    const e = r.decomposition.effects!;
    expect(e.requestVolume + e.tokensPerRequest + e.pricePerToken).toBeCloseTo(50, 4);
    expect(e.requestVolume).toBeCloseTo(20, 4); // (300 − 100) requests × 1,000 tokens × $0.0001
    expect(e.tokensPerRequest).toBeCloseTo(0, 4); // same size per request
    expect(e.pricePerToken).toBeCloseTo(30, 4); // 300 × 1,000 × ($0.0002 − $0.0001)
    expect(r.decomposition.dominant).toBe('pricePerToken'); // the model mix moved to a pricier model
    expect(r.contributors.model[0]).toMatchObject({ key: 'gpt-4o', isNew: true });
    expect(r.contributors.model[0].deltaUsd).toBeCloseTo(55, 6);
  });

  it('every explanation references evidence: request ids for contributors, an aggregate basis otherwise', async () => {
    const { svc } = scenario();
    const r = await svc.investigate('org-a', { projectId: 'p1' }, NOW);
    const byId = Object.fromEntries(r.explanations.map((x) => [x.id, x]));
    expect(byId.summary.text).toMatch(/\$60\.00 versus \$10\.00 expected from the preceding 7 days \(\+\$50\.00, 6\.0×\)/);
    expect(byId.summary.evidence.requestIds.length).toBeGreaterThan(0);
    expect(byId.driver.text).toMatch(/request volume.*tokens per request.*price per token/);
    const contributor = r.explanations.find((x) => x.kind === 'contributor' && x.evidence.dimension === 'model')!;
    expect(contributor.text).toMatch(/Model “gpt-4o” was not used in the baseline and contributed \+\$55\.00/);
    expect(contributor.evidence.requestIds).toEqual(['req_model_gpt-4o']);
    for (const x of r.explanations) {
      expect(x.evidence.basis.length).toBeGreaterThan(5);
      expect(Array.isArray(x.evidence.requestIds)).toBe(true);
    }
    // no explanation text mentions content or secrets
    expect(JSON.stringify(r.explanations)).not.toMatch(/prompt|response text|sk-|sg_live_[0-9a-f]{6}/);
  });

  it('historical context compares with real baseline days', async () => {
    const { svc } = scenario();
    const r = await svc.investigate('org-a', { projectId: 'p1' }, NOW);
    expect(r.historical).toMatchObject({ medianDayUsd: 10, percentileRank: 1, multipleOfMedian: 6 });
    expect(r.explanations.find((x) => x.id === 'history')!.text).toMatch(/higher than 100% of the previous 6 complete days and 6× the median/);
    expect(r.sufficiency).toBe('high');
  });

  it('with no spend in the window it says so instead of inventing a change', async () => {
    const data = new FakeData();
    const r = await new InvestigationService(data as any).investigate('org-a', { projectId: 'p1' }, NOW);
    expect(r.explanations).toHaveLength(1);
    expect(r.explanations[0].text).toBe('There was no spend in this window.');
  });

  it('with no baseline it reports the window honestly and does not split the change', async () => {
    const data = new FakeData();
    data.totalsByWindow = (from) => (from.getTime() >= NOW.getTime() - DAY - 1000 ? T(10, 10_000, 5) : T(0, 0, 0));
    const r = await new InvestigationService(data as any).investigate('org-a', { projectId: 'p1' }, NOW);
    expect(r.decomposition.status).toBe('no_baseline');
    expect(r.sufficiency).toBe('insufficient');
    expect(r.explanations[0].text).toMatch(/no comparable spend/);
    expect(r.explanations.some((x) => x.kind === 'caveat')).toBe(true);
  });

  it('validates the window and the baseline', async () => {
    const svc = new InvestigationService(new FakeData() as any);
    await expect(svc.investigate('org-a', { from: '2026-11-15T10:00:00Z', to: '2026-11-15T10:30:00Z' }, NOW)).rejects.toThrow(/at least 1 hour/);
    await expect(svc.investigate('org-a', { from: '2026-09-01T00:00:00Z', to: '2026-11-15T00:00:00Z' }, NOW)).rejects.toThrow(/31 days/);
    await expect(svc.investigate('org-a', { from: 'nope' }, NOW)).rejects.toThrow(/ISO 8601/);
  });

  it('org-wide investigations add the project dimension; project-scoped ones do not repeat it', async () => {
    const { svc, data } = scenario();
    data.membersByDim.project = { window: [member('p1', 300, 600_000, 60, 'Support')], baseline: [member('p1', 700, 700_000, 70, 'Support')] };
    expect(Object.keys((await svc.investigate('org-a', {}, NOW)).contributors)).toContain('project');
    expect(Object.keys((await svc.investigate('org-a', { projectId: 'p1' }, NOW)).contributors)).not.toContain('project');
  });

  it("another tenant's project is a 404; every query used the caller's organization", async () => {
    const { svc, data } = scenario();
    await expect(svc.investigate('org-a', { projectId: 'p2' }, NOW)).rejects.toBeInstanceOf(NotFoundException);
    data.orgsSeen = [];
    await svc.investigate('org-a', { projectId: 'p1' }, NOW);
    expect(data.orgsSeen.length).toBeGreaterThan(5);
    expect(new Set(data.orgsSeen)).toEqual(new Set(['org-a']));
  });
});

describe('forecast service', () => {
  it('uses the project budget for a project scope and the sum of project budgets for the organization', async () => {
    const data = new FakeData();
    data.daily = Array.from({ length: 14 }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, spendUsd: 10 }));
    const prisma: any = { project: { aggregate: jest.fn(async () => ({ _sum: { budgetMonthly: 250 } })) } };
    const svc = new ForecastService(data as any, prisma);
    const project = await svc.forecast('org-a', 'p1', NOW);
    expect(project.budget!.budgetUsd).toBe(100);
    expect(project.scope).toEqual({ projectId: 'p1', budgetScope: 'project' });
    const org = await svc.forecast('org-a', undefined, NOW);
    expect(org.budget!.budgetUsd).toBe(250);
    expect(org.scope.budgetScope).toBe('organization');
    expect(prisma.project.aggregate).toHaveBeenCalledWith({ where: { orgId: 'org-a' }, _sum: { budgetMonthly: true } });
    await expect(svc.forecast('org-a', 'p2', NOW)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('model comparison service', () => {
  const pricing = new PricingService({ modelPricing: { findMany: async () => [] } } as any, { getCache: async () => null } as any);
  const usage = (extra: Partial<UsageGroup> = {}): UsageGroup => ({
    model: 'gpt-4o', provider: 'OPENAI', requests: 5000, tokensIn: 10_000_000, tokensOut: 2_000_000, cachedTokensIn: 0, actualCostUsd: 45,
    avgTokensIn: 2000, p50TokensIn: 1800, p95TokensIn: 4000, maxTokensIn: 9000, avgTokensOut: 400, p50TokensOut: 350, p95TokensOut: 900, maxTokensOut: 1500, ...extra,
  });

  it('re-prices each used model on every other priced model, ranked, cost-only and approval-gated', async () => {
    const data = new FakeData();
    data.usage = [usage()];
    data.providers = new Set(['OPENAI']);
    const out = await new ModelComparisonService(data as any, pricing).compare('org-a', {}, NOW);
    expect(out.requiresHumanApproval).toBe(true);
    expect(out.disclaimer).toMatch(/cost only/);
    expect(out.disclaimer).toMatch(/not claimed to be equivalent/);
    expect(out.notAssessed).toContain('output quality');
    const s = out.sources[0];
    expect(s.distribution).toMatchObject({ input: { avg: 2000, p95: 4000, max: 9000 }, output: { avg: 400 } });
    expect(s.comparisons.length).toBeGreaterThan(3);
    expect(s.comparisons.every((c) => c.qualityEquivalence === 'not_assessed' && c.requiresHumanApproval === true)).toBe(true);
    expect(s.comparisons.some((c) => c.candidate.model === 'gpt-4o')).toBe(false); // never compares a model to itself
    const mini = s.comparisons.find((c) => c.candidate.model === 'gpt-4o-mini')!;
    expect(mini.hypotheticalUsd.low).toBeCloseTo((10_000_000 * 0.15 + 2_000_000 * 0.6) / 1e6, 5);
  });

  it('can be narrowed to chosen models and validates the look-back', async () => {
    const data = new FakeData();
    data.usage = [usage()];
    const svc = new ModelComparisonService(data as any, pricing);
    const out = await svc.compare('org-a', { models: ['gpt-4o-mini', 'claude-haiku-5-5'] }, NOW);
    expect(out.sources[0].comparisons.map((c) => c.candidate.model).sort()).toEqual(['claude-haiku-5-5', 'gpt-4o-mini']);
    await expect(svc.compare('org-a', { days: 0 }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.compare('org-a', { days: 400 }, NOW)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('flags a missing provider key for another provider and notes the data-quality gap on cached tokens', async () => {
    const data = new FakeData();
    data.usage = [usage()];
    data.providers = new Set(['OPENAI']);
    const out = await new ModelComparisonService(data as any, pricing).compare('org-a', {}, NOW);
    const claude = out.sources[0].comparisons.find((c) => c.candidate.provider === 'ANTHROPIC')!;
    expect(claude.checks.find((c) => c.id === 'provider_key')!.status).toBe('warn');
    expect(out.dataQuality.note).toMatch(/recorded only for newer requests/);
  });

  it("another tenant's project → 404; only the caller's org is queried", async () => {
    const data = new FakeData();
    await expect(new ModelComparisonService(data as any, pricing).compare('org-a', { projectId: 'p2' }, NOW)).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ── recommendations: lifecycle and human decisions ──────────────────────────
class FakeRecDb {
  rows: Row[] = [];
  recommendation = {
    findMany: async ({ where = {}, include, take }: any = {}) => this.rows.filter((r) => matches(r, where)).slice(0, take ?? 1e9).map((r) => ({ ...r, ...(include?.project ? { project: { name: 'Support' } } : {}) })),
    findFirst: async ({ where }: any) => this.rows.find((r) => matches(r, where)) ?? null,
    create: async ({ data }: any) => { const row = { id: `rec-${this.rows.length + 1}`, createdAt: new Date(), updatedAt: new Date(), decidedById: null, decidedAt: null, decisionNote: null, dismissedUntil: null, ...data }; this.rows.push(row); return { ...row }; },
    update: async ({ where, data }: any) => { const row = this.rows.find((r) => r.id === where.id)!; Object.assign(row, data); return { ...row }; },
    updateMany: async ({ where, data }: any) => { const rows = this.rows.filter((r) => matches(r, where)); rows.forEach((r) => Object.assign(r, data)); return { count: rows.length }; },
  };
  project = { findMany: async () => [{ id: 'p1', name: 'Support' }] };
}

const draft = (extra: Partial<RecommendationDraft> = {}): RecommendationDraft => ({
  type: 'SPEND_INCREASE', projectId: 'p1', fingerprint: 'SPEND_INCREASE:p1', severity: 'warning', title: 'Spend is up', summary: 's', evidence: { x: 1 }, method: 'm'.repeat(50),
  impactLowUsd: 10, impactHighUsd: 10, impactBasis: 'observed', confidence: 'high', action: 'look', requiresApproval: false, ...extra,
});

describe('recommendation lifecycle', () => {
  function build() {
    const db = new FakeRecDb();
    const publish = jest.fn(async () => ({ deliveries: 1 }));
    const svc = new RecommendationsService(db as any, new FakeData() as any, {} as any, {} as any, {} as any, { publish } as any);
    return { db, svc, publish };
  }
  const day = 86_400_000;

  it('creates a finding once; regenerating UPDATES it in place (no duplicate) and keeps its first-seen time', async () => {
    const { db, svc } = build();
    const t1 = new Date('2026-11-15T00:00:00Z');
    const t2 = new Date('2026-11-16T00:00:00Z');
    expect(await svc.reconcile('org-a', [draft()], ['p1'], t1)).toMatchObject({ created: 1, updated: 0, resolved: 0 });
    expect(await svc.reconcile('org-a', [draft({ title: 'Spend is up more' })], ['p1'], t2)).toMatchObject({ created: 0, updated: 1 });
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ title: 'Spend is up more', firstSeenAt: t1, lastSeenAt: t2, status: 'OPEN' });
  });

  it('resolves an OPEN finding when its condition no longer holds, but never touches human-decided ones', async () => {
    const { db, svc } = build();
    const now = new Date('2026-11-15T00:00:00Z');
    await svc.reconcile('org-a', [draft(), draft({ type: 'BUDGET_RISK', fingerprint: 'BUDGET_RISK:p1:2026-11' })], ['p1'], now);
    db.rows.find((r) => r.type === 'BUDGET_RISK')!.status = 'ACKNOWLEDGED';
    const res = await svc.reconcile('org-a', [], ['p1'], now);
    expect(res.resolved).toBe(1);
    expect(db.rows.find((r) => r.type === 'SPEND_INCREASE')!.status).toBe('RESOLVED');
    expect(db.rows.find((r) => r.type === 'BUDGET_RISK')!.status).toBe('ACKNOWLEDGED');
  });

  it('a RESOLVED finding that recurs is reopened as OPEN and announced again', async () => {
    const { db, svc, publish } = build();
    const now = new Date('2026-11-15T00:00:00Z');
    await svc.reconcile('org-a', [draft()], ['p1'], now);
    await svc.reconcile('org-a', [], ['p1'], now);
    expect(db.rows[0].status).toBe('RESOLVED');
    await svc.reconcile('org-a', [draft()], ['p1'], new Date(now.getTime() + day));
    expect(db.rows[0].status).toBe('OPEN');
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('a DISMISSED finding stays dismissed for 14 days even while the condition persists, then reopens', async () => {
    const { db, svc } = build();
    const t0 = new Date('2026-11-15T00:00:00Z');
    await svc.reconcile('org-a', [draft()], ['p1'], t0);
    await svc.decide('org-a', { id: 'u1', role: 'MEMBER' }, db.rows[0].id, 'dismiss', 'known launch', t0);
    expect(db.rows[0]).toMatchObject({ status: 'DISMISSED', decisionNote: 'known launch', decidedById: 'u1' });
    await svc.reconcile('org-a', [draft()], ['p1'], new Date(t0.getTime() + 7 * day));
    expect(db.rows[0].status).toBe('DISMISSED');
    await svc.reconcile('org-a', [draft()], ['p1'], new Date(t0.getTime() + 15 * day));
    expect(db.rows[0]).toMatchObject({ status: 'OPEN', decidedById: null, dismissedUntil: null });
  });

  it('only warning/critical findings are announced to notification channels; info-level ones are not', async () => {
    const { svc, publish } = build();
    const now = new Date('2026-11-15T00:00:00Z');
    await svc.reconcile('org-a', [draft({ severity: 'info', fingerprint: 'A:1', type: 'MODEL_CONCENTRATION' }), draft({ severity: 'critical', fingerprint: 'B:1' })], ['p1'], now);
    expect(publish).toHaveBeenCalledTimes(1);
    expect((publish.mock.calls[0] as any[])[0]).toMatchObject({ type: 'recommendation.created', orgId: 'org-a', data: { severity: 'critical' } });
  });

  it('the announcement carries a summary, never the evidence payload', async () => {
    const { svc, publish } = build();
    await svc.reconcile('org-a', [draft({ evidence: { ledgerRequestIds: ['req_secret_ref'], big: 'x'.repeat(1000) } })], ['p1'], new Date());
    expect(JSON.stringify((publish.mock.calls[0] as any[])[0])).not.toMatch(/req_secret_ref|xxxxxxxx/);
  });

  it('a failing notification never breaks recommendation generation', async () => {
    const db = new FakeRecDb();
    const svc = new RecommendationsService(db as any, new FakeData() as any, {} as any, {} as any, {} as any, { publish: async () => { throw new Error('boom'); } } as any);
    await expect(svc.reconcile('org-a', [draft()], ['p1'], new Date())).resolves.toMatchObject({ created: 1 });
  });

  it('findings of other organizations are untouched by this org\'s run', async () => {
    const { db, svc } = build();
    db.rows.push({ id: 'other', orgId: 'org-b', fingerprint: 'SPEND_INCREASE:pX', status: 'OPEN', projectId: 'pX' });
    await svc.reconcile('org-a', [], ['p1'], new Date());
    expect(db.rows.find((r) => r.id === 'other')!.status).toBe('OPEN');
  });
});

describe('human decisions', () => {
  function build() {
    const db = new FakeRecDb();
    const svc = new RecommendationsService(db as any, new FakeData() as any, {} as any, {} as any, {} as any, { publish: jest.fn() } as any);
    return { db, svc };
  }
  const seed = async (db: FakeRecDb, svc: RecommendationsService, requiresApproval: boolean) => {
    await svc.reconcile('org-a', [draft({ requiresApproval, type: requiresApproval ? 'MODEL_EVALUATION' : 'SPEND_INCREASE', fingerprint: requiresApproval ? 'MODEL_EVALUATION:p1:a:b' : 'SPEND_INCREASE:p1' })], ['p1'], new Date());
    return db.rows[db.rows.length - 1].id as string;
  };

  it('approving a model evaluation needs OWNER or ADMIN; a MEMBER is refused, and nothing is recorded', async () => {
    const { db, svc } = build();
    const id = await seed(db, svc, true);
    await expect(svc.decide('org-a', { id: 'u2', role: 'MEMBER' }, id, 'approve_evaluation')).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.rows[0]).toMatchObject({ status: 'OPEN', decidedById: null });
    const res = await svc.decide('org-a', { id: 'u1', role: 'ADMIN' }, id, 'approve_evaluation', 'Run an offline eval first');
    expect(res.status).toBe('APPROVED_FOR_EVALUATION');
    expect(res.note).toMatch(/does not change any model configuration/);
    expect(db.rows[0]).toMatchObject({ decidedById: 'u1', decisionNote: 'Run an offline eval first' });
  });

  it('only findings that involve an approval can be "approved"', async () => {
    const { db, svc } = build();
    const id = await seed(db, svc, false);
    await expect(svc.decide('org-a', { id: 'u1', role: 'OWNER' }, id, 'approve_evaluation')).rejects.toThrow(/does not involve an approval/);
  });

  it('any member can acknowledge or dismiss; unknown actions are rejected', async () => {
    const { db, svc } = build();
    const id = await seed(db, svc, false);
    await expect(svc.decide('org-a', { id: 'u2', role: 'MEMBER' }, id, 'acknowledge')).resolves.toMatchObject({ status: 'ACKNOWLEDGED' });
    await expect(svc.decide('org-a', { id: 'u2', role: 'MEMBER' }, id, 'delete' as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("another organization's recommendation is a 404 and is not modified", async () => {
    const { db, svc } = build();
    const id = await seed(db, svc, true);
    await expect(svc.decide('org-b', { id: 'u9', role: 'OWNER' }, id, 'approve_evaluation')).rejects.toBeInstanceOf(NotFoundException);
    expect(db.rows[0].status).toBe('OPEN');
  });

  it('the decision note is capped at 500 characters', async () => {
    const { db, svc } = build();
    const id = await seed(db, svc, false);
    await svc.decide('org-a', { id: 'u1', role: 'OWNER' }, id, 'acknowledge', 'x'.repeat(2000));
    expect(db.rows[0].decisionNote).toHaveLength(500);
  });

  it('list defaults to open work, orders by severity, and scopes to the org', async () => {
    const { db, svc } = build();
    await svc.reconcile('org-a', [draft({ severity: 'info', fingerprint: 'I:1', type: 'MODEL_CONCENTRATION' }), draft({ severity: 'critical', fingerprint: 'C:1' })], ['p1'], new Date());
    db.rows.push({ id: 'o', orgId: 'org-b', status: 'OPEN', severity: 'critical', fingerprint: 'Z', projectId: null, lastSeenAt: new Date(), impactLowUsd: null, evidence: {}, project: null });
    db.rows.push({ id: 'old', orgId: 'org-a', status: 'RESOLVED', severity: 'critical', fingerprint: 'R', projectId: null, lastSeenAt: new Date(), impactLowUsd: null, evidence: {} });
    const out = await svc.list('org-a', {});
    expect(out.recommendations.map((r) => r.severity)).toEqual(['critical', 'info']);
    expect(out.recommendations.some((r) => r.id === 'o' || r.id === 'old')).toBe(false);
    expect((await svc.list('org-a', { status: 'RESOLVED' })).recommendations).toHaveLength(1);
  });
});
