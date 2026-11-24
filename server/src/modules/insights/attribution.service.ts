import { BadRequestException, Injectable } from '@nestjs/common';
import { Dimension, DIMENSIONS, InsightsDataService } from './insights.data';

export const MAX_RANGE_DAYS = 92;

export function parseRange(from?: string, to?: string, defaultDays = 30, now = new Date()): { from: Date; to: Date } {
  const end = to ? new Date(to) : now;
  const start = from ? new Date(from) : new Date(end.getTime() - defaultDays * 86_400_000);
  if (Number.isNaN(end.getTime()) || Number.isNaN(start.getTime())) throw new BadRequestException('from/to must be ISO 8601 dates');
  if (start >= end) throw new BadRequestException('from must be before to');
  if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * 86_400_000) throw new BadRequestException(`The range cannot exceed ${MAX_RANGE_DAYS} days`);
  return { from: start, to: end };
}

/**
 * Where the money goes, by any one dimension of the ledger. Attribution is only ever what the ledger recorded:
 * spend with no application/team tag is reported as "Unattributed", with the share of spend that is, so
 * incomplete tagging is visible instead of silently spread across the tagged rows.
 */
@Injectable()
export class AttributionService {
  constructor(private readonly data: InsightsDataService) {}

  async attribute(orgId: string, q: { dimension: string; projectId?: string; from?: string; to?: string }) {
    if (!DIMENSIONS.includes(q.dimension as Dimension)) throw new BadRequestException(`dimension must be one of ${DIMENSIONS.join(', ')}`);
    const dimension = q.dimension as Dimension;
    await this.data.assertScope(orgId, q.projectId);
    const { from, to } = parseRange(q.from, q.to);

    const [members, totals] = await Promise.all([this.data.members(orgId, q.projectId, from, to, dimension), this.data.totals(orgId, q.projectId, from, to)]);
    const totalCost = totals.costUsd;
    const rows = members
      .map((m) => ({
        key: m.key,
        label: m.label,
        unattributed: m.key === null,
        costUsd: Number(m.costUsd.toFixed(6)),
        share: totalCost > 0 ? Number((m.costUsd / totalCost).toFixed(4)) : 0,
        requests: m.requests,
        tokens: m.tokensIn + m.tokensOut,
        tokensPerRequest: m.requests > 0 ? Math.round((m.tokensIn + m.tokensOut) / m.requests) : 0,
        costPerRequestUsd: m.requests > 0 ? Number((m.costUsd / m.requests).toFixed(6)) : 0,
      }))
      .sort((a, b) => b.costUsd - a.costUsd);

    const unattributedCost = rows.filter((r) => r.unattributed).reduce((a, r) => a + r.costUsd, 0);
    const taggable = dimension === 'application' || dimension === 'team';
    return {
      dimension,
      scope: { projectId: q.projectId ?? null },
      range: { from: from.toISOString(), to: to.toISOString() },
      totals: { costUsd: Number(totalCost.toFixed(6)), requests: totals.requests, tokens: totals.tokensIn + totals.tokensOut },
      rows,
      coverage: {
        attributedShare: totalCost > 0 ? Number((1 - unattributedCost / totalCost).toFixed(4)) : null,
        unattributedUsd: Number(unattributedCost.toFixed(6)),
        note: taggable
          ? 'Spend without an application/team tag is shown as “Unattributed” and is never allocated to tagged rows.'
          : null,
      },
      howToAttribute: taggable ? TAGGING_GUIDE : null,
    };
  }
}

/** Shown wherever attribution coverage is incomplete. Mirrors the gateway's tag handling exactly. */
export const TAGGING_GUIDE = {
  keyLevel: 'Assign an application and/or team when creating a gateway key. Key-level values are authoritative: requests made with that key are always attributed to them.',
  headers: {
    'X-SpendGuard-Application': 'Application name, e.g. "support-bot" (lowercase letters, digits, . _ : -, up to 64 characters).',
    'X-SpendGuard-Team': 'Team name, e.g. "growth".',
    'X-SpendGuard-Tags': 'Optional extra tags as key=value pairs, e.g. "env=prod,feature=search" (up to 5).',
  },
  precedence: 'A dimension set on the gateway key wins over a header. Headers only fill dimensions the key leaves unset. Invalid values are ignored (never guessed) and the request is still served.',
};
