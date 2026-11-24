import { BadRequestException, Injectable } from '@nestjs/common';
import {
  baselineSufficiency, Bucket, ChangePoint, contributors, Contributor, decompose, Decomposition, findChangePoint, historicalContext, HistoricalContext,
  INVESTIGATION_METHOD, normalizeTotals, Totals,
} from './calc/investigation.calc';
import { Dimension, EvidenceRequest, InsightsDataService } from './insights.data';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface Explanation {
  id: string;
  kind: 'summary' | 'driver' | 'timing' | 'contributor' | 'history' | 'anomaly' | 'caveat';
  text: string;
  /** What backs the statement: ledger request ids and/or the aggregate scope it was computed over. */
  evidence: { requestIds: string[]; dimension?: string; member?: string | null; basis: string };
}

const usd = (n: number) => `$${Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2)}`;
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${usd(Math.abs(n))}`;

@Injectable()
export class InvestigationService {
  constructor(private readonly data: InsightsDataService) {}

  /**
   * What changed, when, where, and why: window vs the preceding baseline, every statement tied to ledger records.
   * Defaults: the last 24 hours versus the 7 days before.
   */
  async investigate(orgId: string, q: { projectId?: string; from?: string; to?: string; baselineDays?: number }, now = new Date()) {
    const project = await this.data.assertScope(orgId, q.projectId);
    const to = q.to ? new Date(q.to) : now;
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - DAY);
    if (Number.isNaN(to.getTime()) || Number.isNaN(from.getTime())) throw new BadRequestException('from/to must be ISO 8601 dates');
    const windowMs = to.getTime() - from.getTime();
    if (windowMs < HOUR) throw new BadRequestException('The window must be at least 1 hour');
    if (windowMs > 31 * DAY) throw new BadRequestException('The window cannot exceed 31 days');
    const baselineDays = Math.min(28, Math.max(3, Math.floor(q.baselineDays ?? 7)));
    const baselineFrom = new Date(from.getTime() - baselineDays * DAY);
    const baselineMs = from.getTime() - baselineFrom.getTime();
    const scale = windowMs / baselineMs;

    const unit: 'hour' | 'day' = windowMs <= 3 * DAY ? 'hour' : 'day';
    const bucketMs = unit === 'hour' ? HOUR : DAY;
    // align the series start to the bucket grid
    const gridStart = new Date(Math.floor(baselineFrom.getTime() / bucketMs) * bucketMs);

    const dims: Dimension[] = q.projectId ? ['model', 'key', 'application', 'team'] : ['project', 'model', 'key', 'application', 'team'];
    // One GROUPING SETS scan per range gives the totals and every dimension (was 1 + one query per dimension, twice)
    const [winSummary, baseSummary, series, dailyBase] = await Promise.all([
      this.data.summary(orgId, q.projectId, from, to, dims),
      this.data.summary(orgId, q.projectId, baselineFrom, from, dims),
      this.data.bucketSeries(orgId, q.projectId, gridStart, to, unit),
      this.data.dailySpend(orgId, q.projectId, baselineFrom, from),
    ]);
    const win = winSummary.totals;
    const base = baseSummary.totals;
    const windowMembers = dims.map((d) => winSummary.members[d]);
    const baselineMembers = dims.map((d) => baseSummary.members[d]);

    const baseNorm = normalizeTotals(base, scale);
    const decomposition = decompose(win, baseNorm);
    const delta = win.costUsd - baseNorm.costUsd;

    const byDim: Record<string, Contributor[]> = {};
    dims.forEach((d, i) => {
      byDim[d] = contributors(windowMembers[i], baselineMembers[i], scale, delta).slice(0, 8);
    });

    const changePoint = findChangePoint(series, bucketMs, gridStart.getTime(), from.getTime(), to.getTime());

    // Baseline history = COMPLETE UTC days inside the baseline only (a partial day at either end would understate it
    // and skew the comparison). A complete day with no rows really cost $0, so it is zero-filled.
    const dailyMap = new Map(dailyBase.map((d) => [d.date, d.spendUsd]));
    const baselineDaily: number[] = [];
    for (let t = Math.ceil(baselineFrom.getTime() / DAY) * DAY; t + DAY <= from.getTime(); t += DAY) baselineDaily.push(dailyMap.get(new Date(t).toISOString().slice(0, 10)) ?? 0);
    const daysWithSpend = baselineDaily.filter((v) => v > 0).length;
    const sufficiency = baselineSufficiency(daysWithSpend);
    const history = historicalContext(win.costUsd / (windowMs / DAY), baselineDaily);

    // ── Evidence: real ledger rows, no content ─────────────────────────
    const topDim = (d: Dimension) => byDim[d]?.filter((c) => c.deltaUsd > 0).slice(0, 2) ?? [];
    const memberEvidence = await Promise.all(
      (['model', 'key', 'application'] as Dimension[]).filter((d) => dims.includes(d)).flatMap((d) =>
        topDim(d).map(async (c) => ({ d, c, rows: await this.data.evidenceRequests(orgId, q.projectId, from, to, { dimension: d, key: c.key, take: 5 }) })),
      ),
    );
    const [topRequests, anomalies] = await Promise.all([
      this.data.evidenceRequests(orgId, q.projectId, from, to, { take: 10 }),
      this.data.evidenceRequests(orgId, q.projectId, from, to, { take: 10, anomaliesOnly: true }),
    ]);

    const explanations = this.explain({ win, baseNorm, baselineDays, decomposition, changePoint, history, sufficiency, unit, memberEvidence, anomalies, windowHours: windowMs / HOUR, topRequests });

    return {
      scope: { projectId: q.projectId ?? null, projectName: project?.name ?? null },
      window: { from: from.toISOString(), to: to.toISOString(), hours: Number((windowMs / HOUR).toFixed(2)) },
      baseline: { from: baselineFrom.toISOString(), to: from.toISOString(), days: baselineDays, daysWithSpend, scaledToWindow: Number(scale.toFixed(6)) },
      totals: { window: win, baselineScaled: baseNorm, baselineActual: base },
      decomposition,
      contributors: byDim,
      changePoint,
      historical: history,
      sufficiency,
      series: { unit, buckets: series },
      evidence: { topRequests, anomalies, byContributor: memberEvidence.map((m) => ({ dimension: m.d, key: m.c.key, label: m.c.label, requests: m.rows })) },
      explanations,
      method: INVESTIGATION_METHOD,
    };
  }

  private explain(p: {
    win: Totals; baseNorm: Totals; baselineDays: number; decomposition: Decomposition; changePoint: ChangePoint | null; history: HistoricalContext | null;
    sufficiency: string; unit: 'hour' | 'day'; windowHours: number; topRequests: EvidenceRequest[]; anomalies: EvidenceRequest[];
    memberEvidence: Array<{ d: Dimension; c: Contributor; rows: EvidenceRequest[] }>;
  }): Explanation[] {
    const out: Explanation[] = [];
    const d = p.decomposition;
    const ids = (rows: EvidenceRequest[]) => rows.map((r) => r.id);
    const basisAll = `ledger aggregate of the window and the ${p.baselineDays} days before it`;

    if (p.win.requests === 0) {
      out.push({ id: 'summary', kind: 'summary', text: 'There was no spend in this window.', evidence: { requestIds: [], basis: basisAll } });
      return out;
    }
    if (d.status === 'ok') {
      const ratio = d.baselineSpendUsd > 0 ? d.windowSpendUsd / d.baselineSpendUsd : 0;
      out.push({
        id: 'summary', kind: 'summary',
        text: `Spend in the window was ${usd(d.windowSpendUsd)} versus ${usd(d.baselineSpendUsd)} expected from the preceding ${p.baselineDays} days (${signed(d.deltaUsd)}, ${ratio.toFixed(1)}×).`,
        evidence: { requestIds: ids(p.topRequests.slice(0, 5)), basis: basisAll },
      });
      const e = d.effects!;
      const parts = [
        { k: 'requestVolume', v: e.requestVolume, text: `request volume (${Math.round(d.baseline!.requests).toLocaleString('en-US')} → ${d.window!.requests.toLocaleString('en-US')} requests)` },
        { k: 'tokensPerRequest', v: e.tokensPerRequest, text: `tokens per request (${Math.round(d.baseline!.tokensPerRequest).toLocaleString('en-US')} → ${Math.round(d.window!.tokensPerRequest).toLocaleString('en-US')})` },
        { k: 'pricePerToken', v: e.pricePerToken, text: `price per token (model mix and pricing: $${d.baseline!.usdPer1kTokens.toFixed(4)} → $${d.window!.usdPer1kTokens.toFixed(4)} per 1K tokens)` },
      ];
      out.push({
        id: 'driver', kind: 'driver',
        text: `The change splits into: ${parts.map((x) => `${x.text} ${signed(x.v)}`).join('; ')}. The largest factor is ${parts.find((x) => x.k === d.dominant)!.text.split(' (')[0]}.`,
        evidence: { requestIds: [], basis: 'exact decomposition: request volume + tokens per request + price per token = total change' },
      });
    } else {
      out.push({ id: 'summary', kind: 'summary', text: `Spend in the window was ${usd(p.win.costUsd)}. ${d.note ?? ''}`.trim(), evidence: { requestIds: ids(p.topRequests.slice(0, 5)), basis: basisAll } });
    }

    if (p.changePoint) {
      out.push({
        id: 'timing', kind: 'timing',
        text: `Spend first jumped in the ${p.unit} starting ${p.changePoint.startedAt.slice(0, 16).replace('T', ' ')} UTC: ${usd(p.changePoint.bucketCostUsd)} against a baseline of ${usd(p.changePoint.baselineMeanUsd)} per ${p.unit} (threshold ${usd(p.changePoint.thresholdUsd)}).`,
        evidence: { requestIds: ids(p.topRequests.filter((r) => r.at >= p.changePoint!.startedAt).slice(0, 5)), basis: `${p.unit}ly ledger totals` },
      });
    } else if (d.status === 'ok' && d.deltaUsd > 0) {
      out.push({ id: 'timing', kind: 'timing', text: 'No single sudden jump was found: the increase looks gradual or spread across the window.', evidence: { requestIds: [], basis: `${p.unit}ly ledger totals` } });
    }

    for (const m of p.memberEvidence) {
      out.push({
        id: `contributor:${m.d}:${m.c.key ?? 'none'}`, kind: 'contributor',
        text: `${DIM_NOUN[m.d]} “${m.c.label}” ${m.c.isNew ? 'was not used in the baseline and ' : ''}contributed ${signed(m.c.deltaUsd)}${m.c.shareOfChange !== null ? ` (${Math.round(m.c.shareOfChange * 100)}% of the change)` : ''}: ${usd(m.c.windowCostUsd)} in the window versus ${usd(m.c.baselineCostUsd)} expected.`,
        evidence: { requestIds: ids(m.rows), dimension: m.d, member: m.c.key, basis: `ledger rows in the window for this ${m.d}` },
      });
    }

    if (p.history) {
      out.push({
        id: 'history', kind: 'history',
        text: `At ${usd(p.history.windowSpendPerDayUsd)} per day this is higher than ${Math.round(p.history.percentileRank * 100)}% of the previous ${p.history.baselineDays} complete days${p.history.multipleOfMedian ? ` and ${p.history.multipleOfMedian}× the median day (${usd(p.history.medianDayUsd)})` : ''}; the highest earlier day was ${usd(p.history.maxDayUsd)}.`,
        evidence: { requestIds: [], basis: `daily ledger totals for the ${p.history.baselineDays} baseline days` },
      });
    }

    if (p.anomalies.length) {
      out.push({
        id: 'anomaly', kind: 'anomaly',
        text: `${p.anomalies.length}${p.anomalies.length >= 10 ? '+' : ''} request${p.anomalies.length === 1 ? ' was' : 's were'} individually flagged as anomalous in this window (most expensive first).`,
        evidence: { requestIds: ids(p.anomalies), basis: 'ledger rows with anomaly_status = ANOMALY' },
      });
    }

    if (p.sufficiency === 'insufficient' || p.sufficiency === 'low') {
      out.push({ id: 'caveat', kind: 'caveat', text: `Only ${p.baselineDays} baseline days were requested and spend occurred on too few of them to be a dependable comparison; read the comparison as indicative.`, evidence: { requestIds: [], basis: 'baseline days with spend' } });
    }
    return out;
  }
}

const DIM_NOUN: Record<Dimension, string> = { project: 'Project', key: 'Gateway key', application: 'Application', team: 'Team', provider: 'Provider', model: 'Model' };
