import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { Bucket, MemberTotals, Totals } from './calc/investigation.calc';
import { UsageGroup } from './calc/comparison.calc';
import { RollupService } from './rollup.service';
import { splitWindow } from './rollup.window';

/**
 * Read-only ledger queries for the intelligence features.
 *
 * Rules every query here follows:
 *  - TENANT: scoped to the caller's organization through the project (`projects.org_id`) FIRST; a project id from
 *    another tenant yields 404, never data. The org id always comes from the authenticated user.
 *  - SOURCE OF TRUTH: reads `requests` (the spend ledger); blocked requests (`is_blocked`) are not spend and are excluded.
 *  - PRIVACY: never selects prompt/response previews, client IP or metadata JSON.
 *  - Parameterised SQL only (Prisma.sql); dimensions are whitelisted, never interpolated from input.
 */

export type Dimension = 'project' | 'key' | 'application' | 'team' | 'provider' | 'model';
const FIELD: Record<Dimension, 'projectId' | 'gatewayKeyId' | 'application' | 'team' | 'provider' | 'model'> = {
  project: 'projectId', key: 'gatewayKeyId', application: 'application', team: 'team', provider: 'provider', model: 'model',
};
export const DIMENSIONS = Object.keys(FIELD) as Dimension[];

const num = (v: unknown) => Number(v ?? 0);

export interface EvidenceRequest {
  id: string;
  at: string;
  projectId: string;
  model: string;
  provider: string;
  gatewayKeyId: string | null;
  application: string | null;
  team: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  reservationOverrunUsd: number;
  anomalyStatus: string;
}

@Injectable()
export class InsightsDataService {
  constructor(
    private readonly prisma: PrismaService,
    // Optional + off by default (INSIGHTS_ROLLUPS=on): without it every query reads the ledger exactly as before
    @Optional() private readonly rollups?: RollupService,
  ) {}

  /** Whole-day part of a window that the rollup can answer, plus the raw edges. Rollup disabled -> everything is raw. */
  private async plan(from: Date, to: Date) {
    return splitWindow(from, to, (await this.rollups?.completeThrough()) ?? null);
  }

  private rollupScope(orgId: string, projectId: string | undefined, a: Date, b: Date) {
    return Prisma.sql`org_id = ${orgId} ${projectId ? Prisma.sql`AND project_id = ${projectId}` : Prisma.empty} AND day >= ${a}::date AND day < ${b}::date`;
  }

  /** The project must belong to the org (404 otherwise, indistinguishable from "does not exist"). */
  async assertScope(orgId: string, projectId?: string) {
    if (!projectId) return null;
    const p = await this.prisma.project.findFirst({ where: { id: projectId, orgId }, select: { id: true, name: true, budgetMonthly: true } });
    if (!p) throw new NotFoundException('Project not found');
    return p;
  }

  private where(orgId: string, projectId: string | undefined, from: Date, to: Date) {
    return { project: { orgId }, ...(projectId ? { projectId } : {}), isBlocked: false, createdAt: { gte: from, lt: to } };
  }

  private sqlScope(orgId: string, projectId?: string) {
    return Prisma.sql`p.org_id = ${orgId} AND r.is_blocked = false ${projectId ? Prisma.sql`AND r.project_id = ${projectId}` : Prisma.empty}`;
  }

  async totals(orgId: string, projectId: string | undefined, from: Date, to: Date): Promise<Totals> {
    const plan = await this.plan(from, to);
    const parts: Totals[] = [];
    for (const r of plan.raw) {
      const a = await this.prisma.request.aggregate({
        where: this.where(orgId, projectId, r.from, r.to),
        _sum: { tokensIn: true, tokensOut: true, costEstimate: true },
        _count: { id: true },
      });
      parts.push({ requests: a._count.id, tokensIn: num(a._sum.tokensIn), tokensOut: num(a._sum.tokensOut), costUsd: num(a._sum.costEstimate) });
    }
    if (plan.rollup) {
      const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT COALESCE(SUM(requests), 0) AS n, COALESCE(SUM(tokens_in), 0) AS ti, COALESCE(SUM(tokens_out), 0) AS tout, COALESCE(SUM(cost_usd), 0) AS cost
        FROM request_daily_rollups WHERE ${this.rollupScope(orgId, projectId, plan.rollup.from, plan.rollup.to)}`);
      parts.push({ requests: num(rows[0]?.n), tokensIn: num(rows[0]?.ti), tokensOut: num(rows[0]?.tout), costUsd: num(rows[0]?.cost) });
    }
    return parts.reduce((acc, p) => ({ requests: acc.requests + p.requests, tokensIn: acc.tokensIn + p.tokensIn, tokensOut: acc.tokensOut + p.tokensOut, costUsd: acc.costUsd + p.costUsd }), { requests: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 });
  }

  /** Spend per UTC day for [from, to). Days without ledger rows are absent (the caller zero-fills). */
  async dailySpend(orgId: string, projectId: string | undefined, from: Date, to: Date): Promise<Array<{ date: string; spendUsd: number }>> {
    const plan = await this.plan(from, to);
    const byDay = new Map<string, number>();
    const add = (d: string, v: number) => byDay.set(d, (byDay.get(d) ?? 0) + v);
    for (const r of plan.raw) {
      const rows = await this.prisma.$queryRaw<Array<{ day: Date; cost: unknown }>>(Prisma.sql`
        SELECT date_trunc('day', r.created_at) AS day, COALESCE(SUM(r.cost_estimate), 0) AS cost
        FROM requests r JOIN projects p ON p.id = r.project_id
        WHERE ${this.sqlScope(orgId, projectId)} AND r.created_at >= ${r.from} AND r.created_at < ${r.to}
        GROUP BY 1 ORDER BY 1`);
      for (const x of rows) add(x.day.toISOString().slice(0, 10), num(x.cost));
    }
    if (plan.rollup) {
      const rows = await this.prisma.$queryRaw<Array<{ day: Date; cost: unknown }>>(Prisma.sql`
        SELECT day, COALESCE(SUM(cost_usd), 0) AS cost FROM request_daily_rollups
        WHERE ${this.rollupScope(orgId, projectId, plan.rollup.from, plan.rollup.to)} GROUP BY 1 ORDER BY 1`);
      for (const x of rows) add(x.day.toISOString().slice(0, 10), num(x.cost));
    }
    return [...byDay].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, spendUsd]) => ({ date, spendUsd }));
  }

  /** UTC day of the first ledger row in scope (all time), or null. */
  async firstActivityDate(orgId: string, projectId?: string): Promise<string | null> {
    // Every day up to the watermark is materialised from the very first ledger day, so the earliest rollup day IS the
    // earliest activity day. Without a watermark (or when nothing is in the rollup) the ledger answers.
    if (await this.rollups?.completeThrough()) {
      const r = await this.prisma.$queryRaw<Array<{ first: Date | null }>>(Prisma.sql`
        SELECT MIN(day) AS first FROM request_daily_rollups WHERE org_id = ${orgId} ${projectId ? Prisma.sql`AND project_id = ${projectId}` : Prisma.empty}`);
      if (r[0]?.first) return r[0].first.toISOString().slice(0, 10);
    }
    const rows = await this.prisma.$queryRaw<Array<{ first: Date | null }>>(Prisma.sql`
      SELECT MIN(r.created_at) AS first FROM requests r JOIN projects p ON p.id = r.project_id
      WHERE ${this.sqlScope(orgId, projectId)}`);
    return rows[0]?.first ? rows[0].first.toISOString().slice(0, 10) : null;
  }

  /** Gap-free grids are the caller's job; this returns only buckets that have rows. */
  async bucketSeries(orgId: string, projectId: string | undefined, from: Date, to: Date, unit: 'hour' | 'day'): Promise<Bucket[]> {
    const u = unit === 'hour' ? Prisma.sql`'hour'` : Prisma.sql`'day'`;
    const rows = await this.prisma.$queryRaw<Array<{ b: Date; n: bigint; ti: unknown; tout: unknown; cost: unknown }>>(Prisma.sql`
      SELECT date_trunc(${u}, r.created_at) AS b, COUNT(*) AS n, COALESCE(SUM(r.tokens_in),0) AS ti,
             COALESCE(SUM(r.tokens_out),0) AS tout, COALESCE(SUM(r.cost_estimate),0) AS cost
      FROM requests r JOIN projects p ON p.id = r.project_id
      WHERE ${this.sqlScope(orgId, projectId)} AND r.created_at >= ${from} AND r.created_at < ${to}
      GROUP BY 1 ORDER BY 1`);
    return rows.map((r) => ({ start: r.b.toISOString(), requests: num(r.n), tokensIn: num(r.ti), tokensOut: num(r.tout), costUsd: num(r.cost) }));
  }

  /** Per-dimension totals with human labels. `key === null` is reported as not attributed, never guessed. */
  async members(orgId: string, projectId: string | undefined, from: Date, to: Date, dimension: Dimension): Promise<MemberTotals[]> {
    const field = FIELD[dimension];
    const plan = await this.plan(from, to);
    const merged = new Map<string, { key: string | null; requests: number; tokensIn: number; tokensOut: number; costUsd: number }>();
    const fold = (key: string | null, v: { requests: number; tokensIn: number; tokensOut: number; costUsd: number }) => {
      const k = key ?? '\u0000null';
      const cur = merged.get(k) ?? { key, requests: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 };
      cur.requests += v.requests;
      cur.tokensIn += v.tokensIn;
      cur.tokensOut += v.tokensOut;
      cur.costUsd += v.costUsd;
      merged.set(k, cur);
    };
    for (const r of plan.raw) {
      const groups = await (this.prisma.request.groupBy as any)({
        by: [field],
        where: this.where(orgId, projectId, r.from, r.to),
        _sum: { tokensIn: true, tokensOut: true, costEstimate: true },
        _count: { id: true },
      });
      for (const g of groups) fold(g[field] ?? null, { requests: g._count.id, tokensIn: num(g._sum.tokensIn), tokensOut: num(g._sum.tokensOut), costUsd: num(g._sum.costEstimate) });
    }
    if (plan.rollup) {
      // The column name comes from the whitelist above, never from input
      const col = Prisma.raw({ projectId: 'project_id', gatewayKeyId: 'gateway_key_id', application: 'application', team: 'team', provider: 'provider', model: 'model' }[field]);
      const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT ${col} AS k, SUM(requests) AS n, SUM(tokens_in) AS ti, SUM(tokens_out) AS tout, SUM(cost_usd) AS cost
        FROM request_daily_rollups WHERE ${this.rollupScope(orgId, projectId, plan.rollup.from, plan.rollup.to)} GROUP BY 1`);
      for (const x of rows) fold(x.k === '' || x.k == null ? null : String(x.k), { requests: num(x.n), tokensIn: num(x.ti), tokensOut: num(x.tout), costUsd: num(x.cost) });
    }
    const groups = [...merged.values()];
    const labels = await this.labels(orgId, dimension, groups.map((g) => g.key).filter((k): k is string => !!k));
    return groups.map((g): MemberTotals => ({
      key: g.key,
      label: g.key == null ? UNATTRIBUTED[dimension] : labels.get(String(g.key)) ?? String(g.key),
      requests: g.requests,
      tokensIn: g.tokensIn,
      tokensOut: g.tokensOut,
      costUsd: g.costUsd,
    }));
  }

  /**
   * Totals AND per-dimension members for one window in a single scan per range (GROUP BY GROUPING SETS), instead of one
   * aggregate plus one GROUP BY per dimension. Exactly the same numbers as `totals()` + `members()` (tested against them on
   * real Postgres); GROUPING() tells a real NULL ("unattributed") apart from "not grouped by this column".
   */
  async summary(orgId: string, projectId: string | undefined, from: Date, to: Date, dims: Dimension[]): Promise<{ totals: Totals; members: Record<string, MemberTotals[]> }> {
    const COL: Record<Dimension, string> = { project: 'project_id', key: 'gateway_key_id', application: 'application', team: 'team', provider: 'provider', model: 'model' };
    const list = [...new Set(dims)];
    const plan = await this.plan(from, to);
    type Acc = { key: string | null; requests: number; tokensIn: number; tokensOut: number; costUsd: number };
    const totals: Totals = { requests: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 };
    const acc = new Map<Dimension, Map<string, Acc>>(list.map((d) => [d, new Map()]));
    const fold = (rows: any[], emptyAsNull: boolean) => {
      for (const r of rows) {
        const v = { requests: num(r.n), tokensIn: num(r.ti), tokensOut: num(r.tout), costUsd: num(r.cost) };
        const grouped = list.filter((d) => Number(r[`g_${d}`]) === 0);
        if (grouped.length === 0) {
          totals.requests += v.requests;
          totals.tokensIn += v.tokensIn;
          totals.tokensOut += v.tokensOut;
          totals.costUsd += v.costUsd;
          continue;
        }
        const d = grouped[0];
        const raw = r[`k_${d}`];
        const key = raw == null || (emptyAsNull && raw === '') ? null : String(raw);
        const m = acc.get(d)!;
        const id = key ?? '\u0000null';
        const cur = m.get(id) ?? { key, requests: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 };
        cur.requests += v.requests;
        cur.tokensIn += v.tokensIn;
        cur.tokensOut += v.tokensOut;
        cur.costUsd += v.costUsd;
        m.set(id, cur);
      }
    };
    // Column names come from the fixed map above, never from input
    const sel = (prefix: string, cast: (c: string) => string) =>
      Prisma.raw(list.map((d) => `GROUPING(${prefix}${COL[d]}) AS g_${d}, ${cast(`${prefix}${COL[d]}`)} AS k_${d}`).join(', '));
    const sets = (prefix: string) => Prisma.raw(`GROUPING SETS (${[...list.map((d) => `(${prefix}${COL[d]})`), '()'].join(', ')})`);
    for (const r of plan.raw) {
      const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT ${sel('r.', (c) => (c.endsWith('provider') ? `${c}::text` : c))}, COUNT(*) AS n, COALESCE(SUM(r.tokens_in),0) AS ti, COALESCE(SUM(r.tokens_out),0) AS tout, COALESCE(SUM(r.cost_estimate),0) AS cost
        FROM requests r JOIN projects p ON p.id = r.project_id
        WHERE ${this.sqlScope(orgId, projectId)} AND r.created_at >= ${r.from} AND r.created_at < ${r.to}
        GROUP BY ${sets('r.')}`);
      fold(rows, false);
    }
    if (plan.rollup) {
      const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT ${sel('', (c) => c)}, COALESCE(SUM(requests),0) AS n, COALESCE(SUM(tokens_in),0) AS ti, COALESCE(SUM(tokens_out),0) AS tout, COALESCE(SUM(cost_usd),0) AS cost
        FROM request_daily_rollups WHERE ${this.rollupScope(orgId, projectId, plan.rollup.from, plan.rollup.to)}
        GROUP BY ${sets('')}`);
      fold(rows, true);
    }
    const members: Record<string, MemberTotals[]> = {};
    for (const d of list) {
      const groups = [...acc.get(d)!.values()];
      const labels = await this.labels(orgId, d, groups.map((g) => g.key).filter((k): k is string => !!k));
      members[d] = groups.map((g) => ({ ...g, label: g.key == null ? UNATTRIBUTED[d] : labels.get(g.key) ?? g.key }));
    }
    return { totals, members };
  }

  private async labels(orgId: string, dimension: Dimension, ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    if (dimension === 'project') {
      const rows = await this.prisma.project.findMany({ where: { orgId, id: { in: ids } }, select: { id: true, name: true } });
      return new Map(rows.map((r) => [r.id, r.name]));
    }
    if (dimension === 'key') {
      const rows = await this.prisma.gatewayApiKey.findMany({ where: { id: { in: ids }, project: { orgId } }, select: { id: true, keyName: true, keyPrefix: true } });
      return new Map(rows.map((r) => [r.id, `${r.keyName} (${r.keyPrefix}…)`]));
    }
    return new Map();
  }

  /** Ledger rows with NO content fields. `extra` narrows to one dimension member (whitelisted field names only). */
  async evidenceRequests(orgId: string, projectId: string | undefined, from: Date, to: Date, opts: { dimension?: Dimension; key?: string | null; take?: number; anomaliesOnly?: boolean } = {}): Promise<EvidenceRequest[]> {
    const where: any = this.where(orgId, projectId, from, to);
    if (opts.dimension) where[FIELD[opts.dimension]] = opts.key ?? null;
    if (opts.anomaliesOnly) where.anomalyStatus = 'ANOMALY';
    const rows = await this.prisma.request.findMany({
      where,
      orderBy: { costEstimate: 'desc' },
      take: Math.min(opts.take ?? 5, 25),
      select: {
        id: true, createdAt: true, projectId: true, model: true, provider: true, gatewayKeyId: true, application: true, team: true,
        tokensIn: true, tokensOut: true, costEstimate: true, reservationOverrunUsd: true, anomalyStatus: true,
      },
    });
    return rows.map((r) => ({
      id: r.id, at: r.createdAt.toISOString(), projectId: r.projectId, model: r.model, provider: r.provider, gatewayKeyId: r.gatewayKeyId,
      application: r.application, team: r.team, tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd: num(r.costEstimate),
      reservationOverrunUsd: num(r.reservationOverrunUsd), anomalyStatus: r.anomalyStatus,
    }));
  }

  /** Token distributions per model, for the comparison engine. */
  async modelUsage(orgId: string, projectId: string | undefined, since: Date, limit = 5): Promise<{ groups: UsageGroup[]; rowsWithCacheData: number; totalRows: number }> {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT r.model, r.provider::text AS provider, COUNT(*) AS requests,
             COALESCE(SUM(r.tokens_in),0) AS tokens_in, COALESCE(SUM(r.tokens_out),0) AS tokens_out,
             COALESCE(SUM(r.cached_tokens_in),0) AS cached_in, COALESCE(SUM(r.cost_estimate),0) AS cost,
             COUNT(r.cached_tokens_in) AS cache_known,
             AVG(r.tokens_in) AS avg_in, percentile_cont(0.5) WITHIN GROUP (ORDER BY r.tokens_in) AS p50_in,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY r.tokens_in) AS p95_in, MAX(r.tokens_in) AS max_in,
             AVG(r.tokens_out) AS avg_out, percentile_cont(0.5) WITHIN GROUP (ORDER BY r.tokens_out) AS p50_out,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY r.tokens_out) AS p95_out, MAX(r.tokens_out) AS max_out
      FROM requests r JOIN projects p ON p.id = r.project_id
      WHERE ${this.sqlScope(orgId, projectId)} AND r.created_at >= ${since}
      GROUP BY r.model, r.provider ORDER BY cost DESC LIMIT ${limit}`);
    const groups = rows.map((r): UsageGroup => ({
      model: r.model, provider: r.provider, requests: num(r.requests), tokensIn: num(r.tokens_in), tokensOut: num(r.tokens_out),
      cachedTokensIn: num(r.cached_in), actualCostUsd: num(r.cost),
      avgTokensIn: num(r.avg_in), p50TokensIn: num(r.p50_in), p95TokensIn: num(r.p95_in), maxTokensIn: num(r.max_in),
      avgTokensOut: num(r.avg_out), p50TokensOut: num(r.p50_out), p95TokensOut: num(r.p95_out), maxTokensOut: num(r.max_out),
    }));
    return { groups, rowsWithCacheData: rows.reduce((a, r) => a + num(r.cache_known), 0), totalRows: rows.reduce((a, r) => a + num(r.requests), 0) };
  }

  /** Providers that have an active provider key stored in scope (any project of the org when unscoped). */
  async providersWithKeys(orgId: string, projectId?: string): Promise<Set<string>> {
    const rows = await this.prisma.providerApiKey.findMany({
      where: { isActive: true, project: { orgId }, ...(projectId ? { projectId } : {}) },
      select: { provider: true },
      distinct: ['provider'],
    });
    return new Set(rows.map((r) => r.provider));
  }
}

const UNATTRIBUTED: Record<Dimension, string> = {
  project: 'Unknown project',
  key: 'No gateway key (dashboard session)',
  application: 'Unattributed',
  team: 'Unattributed',
  provider: 'Unknown provider',
  model: 'Unknown model',
};
