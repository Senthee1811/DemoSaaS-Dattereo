import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { Bucket, MemberTotals, Totals } from './calc/investigation.calc';
import { UsageGroup } from './calc/comparison.calc';

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
  constructor(private readonly prisma: PrismaService) {}

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
    const a = await this.prisma.request.aggregate({
      where: this.where(orgId, projectId, from, to),
      _sum: { tokensIn: true, tokensOut: true, costEstimate: true },
      _count: { id: true },
    });
    return { requests: a._count.id, tokensIn: num(a._sum.tokensIn), tokensOut: num(a._sum.tokensOut), costUsd: num(a._sum.costEstimate) };
  }

  /** Spend per UTC day for [from, to). Days without ledger rows are absent (the caller zero-fills). */
  async dailySpend(orgId: string, projectId: string | undefined, from: Date, to: Date): Promise<Array<{ date: string; spendUsd: number }>> {
    const rows = await this.prisma.$queryRaw<Array<{ day: Date; cost: unknown }>>(Prisma.sql`
      SELECT date_trunc('day', r.created_at) AS day, COALESCE(SUM(r.cost_estimate), 0) AS cost
      FROM requests r JOIN projects p ON p.id = r.project_id
      WHERE ${this.sqlScope(orgId, projectId)} AND r.created_at >= ${from} AND r.created_at < ${to}
      GROUP BY 1 ORDER BY 1`);
    return rows.map((r) => ({ date: r.day.toISOString().slice(0, 10), spendUsd: num(r.cost) }));
  }

  /** UTC day of the first ledger row in scope (all time), or null. */
  async firstActivityDate(orgId: string, projectId?: string): Promise<string | null> {
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
    const groups = await (this.prisma.request.groupBy as any)({
      by: [field],
      where: this.where(orgId, projectId, from, to),
      _sum: { tokensIn: true, tokensOut: true, costEstimate: true },
      _count: { id: true },
    });
    const labels = await this.labels(orgId, dimension, groups.map((g: any) => g[field]).filter(Boolean));
    return groups.map((g: any): MemberTotals => ({
      key: g[field] ?? null,
      label: g[field] == null ? UNATTRIBUTED[dimension] : labels.get(String(g[field])) ?? String(g[field]),
      requests: g._count.id,
      tokensIn: num(g._sum.tokensIn),
      tokensOut: num(g._sum.tokensOut),
      costUsd: num(g._sum.costEstimate),
    }));
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
