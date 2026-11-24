import { BadRequestException, Injectable } from '@nestjs/common';
import { PricingService } from '@/modules/pricing/pricing.service';
import { CandidateModel, compareGroupToCandidate, Comparison, GATEWAY_LIMITATIONS, NOT_ASSESSED, rankComparisons, UsageGroup } from './calc/comparison.calc';
import { InsightsDataService } from './insights.data';

@Injectable()
export class ModelComparisonService {
  constructor(
    private readonly data: InsightsDataService,
    private readonly pricing: PricingService,
  ) {}

  /** Candidate models = every priced model except the source, optionally narrowed by the caller. */
  private candidates(exclude: string, only?: string[]): CandidateModel[] {
    return this.pricing
      .getAllPrices()
      .map((p) => p.model)
      .filter((m) => m !== exclude && (!only || only.includes(m)))
      .map((m) => ({ model: m, ...this.pricing.requireModelPrice(m) }));
  }

  /** Historical usage of each model in scope, re-priced on every candidate. Cost comparison only. */
  async compare(orgId: string, q: { projectId?: string; days?: number; models?: string[]; top?: number }, now = new Date()) {
    await this.data.assertScope(orgId, q.projectId);
    const days = Math.floor(q.days ?? 30);
    if (!Number.isFinite(days) || days < 1 || days > 90) throw new BadRequestException('days must be between 1 and 90');
    const since = new Date(now.getTime() - days * 86_400_000);

    const [{ groups, rowsWithCacheData, totalRows }, keyed] = await Promise.all([
      this.data.modelUsage(orgId, q.projectId, since, 5),
      this.data.providersWithKeys(orgId, q.projectId),
    ]);

    const sources = groups.map((group) => {
      const comparisons = this.compareGroup(group, keyed, q.models);
      return {
        usage: group,
        distribution: {
          input: { avg: Math.round(group.avgTokensIn), p50: Math.round(group.p50TokensIn), p95: Math.round(group.p95TokensIn), max: group.maxTokensIn },
          output: { avg: Math.round(group.avgTokensOut), p50: Math.round(group.p50TokensOut), p95: Math.round(group.p95TokensOut), max: group.maxTokensOut },
          cachedInputShare: group.tokensIn > 0 ? Number((group.cachedTokensIn / group.tokensIn).toFixed(4)) : 0,
        },
        comparisons: comparisons.slice(0, q.top ?? 8),
        candidatesConsidered: comparisons.length,
      };
    });

    return {
      scope: { projectId: q.projectId ?? null },
      range: { from: since.toISOString(), to: now.toISOString(), days },
      sources,
      dataQuality: {
        requestsConsidered: totalRows,
        requestsWithCacheData: rowsWithCacheData,
        note: rowsWithCacheData < totalRows ? 'Cached-token counts were recorded only for newer requests; older requests are treated as having no cache hits (this can overstate the high-end saving, never the low end).' : null,
      },
      // Said every time, on purpose: price is the only thing compared.
      disclaimer: 'This compares cost only. Output quality, latency and behaviour are not assessed, and a cheaper model is not claimed to be equivalent. Any migration needs human approval and your own evaluation; SpendGuard changes no model configuration.',
      notAssessed: NOT_ASSESSED,
      gatewayLimitations: GATEWAY_LIMITATIONS,
      requiresHumanApproval: true,
    };
  }

  /** Used by the recommendation service too. */
  compareGroup(group: UsageGroup, providersWithKeys: Set<string>, only?: string[]): Comparison[] {
    return rankComparisons(this.candidates(group.model, only).map((c) => compareGroupToCandidate(group, c, { hasProviderKey: providersWithKeys.has(c.provider) })));
  }
}
