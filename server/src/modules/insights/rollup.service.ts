import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { dayKey, dayStart } from './rollup.window';

const STATE_KEY = 'requests_daily';
const DAY = 86_400_000;

/**
 * Builds and verifies `request_daily_rollups`, a DERIVED summary of the spend ledger.
 *
 *  - `requests` is the only source of truth. The rollup is never written by the gateway and can be dropped and rebuilt.
 *  - Rebuilding a day is DELETE + INSERT ... SELECT in one transaction: idempotent, and readers see the old or the new
 *    rows, never a mixture. A day is always recomputed from the ledger, never incremented, so a correction or a late row
 *    cannot compound.
 *  - LATE ARRIVALS: a ledger row retried through the queue keeps its original timestamp, so it can land in an already
 *    summarised day. Every build re-materialises the last RECHECK_DAYS days, and the daily reconciliation compares
 *    ledger and rollup for the last 35 days and repairs any day that differs, reporting each discrepancy.
 *  - WATERMARK: `complete_through` is the last UTC day that is materialised; readers use the rollup only up to it and
 *    read the ledger for everything newer (and for partial days at the edges of a window).
 */
@Injectable()
export class RollupService {
  private readonly logger = new Logger(RollupService.name);
  private boundaryCache: { at: number; value: Date | null } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  static enabled(): boolean {
    return process.env.INSIGHTS_ROLLUPS === 'on';
  }

  /** Last materialised UTC day (midnight), or null when the rollup is off, empty or unavailable. Cached for 30 s. */
  async completeThrough(now = Date.now()): Promise<Date | null> {
    if (!RollupService.enabled()) return null;
    if (this.boundaryCache && now - this.boundaryCache.at < 30_000) return this.boundaryCache.value;
    let value: Date | null = null;
    try {
      const row = await this.prisma.rollupState.findUnique({ where: { key: STATE_KEY } });
      value = row?.completeThrough ?? null;
    } catch (err: any) {
      this.logger.warn(`Rollup watermark unavailable, reading the ledger directly: ${err?.message}`);
    }
    this.boundaryCache = { at: now, value };
    return value;
  }

  invalidate() {
    this.boundaryCache = null;
  }

  /** Recomputes one UTC day from the ledger. Returns the number of rollup rows written. */
  async rebuildDay(day: string): Promise<number> {
    const [, inserted] = await this.prisma.$transaction([
      this.prisma.$executeRaw(Prisma.sql`DELETE FROM request_daily_rollups WHERE day = ${day}::date`),
      this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO request_daily_rollups (org_id, project_id, day, provider, model, gateway_key_id, application, team,
                                           requests, tokens_in, tokens_out, cached_tokens_in, cached_known_rows, cost_usd, built_at)
        SELECT p.org_id, r.project_id, ${day}::date, r.provider::text, r.model,
               COALESCE(r.gateway_key_id, ''), COALESCE(r.application, ''), COALESCE(r.team, ''),
               COUNT(*), COALESCE(SUM(r.tokens_in), 0), COALESCE(SUM(r.tokens_out), 0),
               COALESCE(SUM(r.cached_tokens_in), 0), COUNT(r.cached_tokens_in), COALESCE(SUM(r.cost_estimate), 0), now()
        FROM requests r JOIN projects p ON p.id = r.project_id
        WHERE r.is_blocked = false AND r.created_at >= ${day}::date AND r.created_at < (${day}::date + 1)
        GROUP BY p.org_id, r.project_id, r.provider, r.model, COALESCE(r.gateway_key_id, ''), COALESCE(r.application, ''), COALESCE(r.team, '')`),
    ]);
    return Number(inserted);
  }

  /**
   * Advances the rollup: backfills from the first ledger day (at most `maxDays` per run, so a large history catches up
   * over several runs without a long transaction) and re-materialises the most recent complete days for late rows.
   */
  async build(now = new Date(), opts: { maxDays?: number; recheckDays?: number } = {}) {
    const maxDays = opts.maxDays ?? (Number(process.env.ROLLUP_MAX_DAYS_PER_RUN) || 31);
    const recheck = opts.recheckDays ?? 2;
    const yesterday = new Date(dayStart(now).getTime() - DAY);
    const state = await this.prisma.rollupState.findUnique({ where: { key: STATE_KEY } });
    let through = state?.completeThrough ? dayStart(state.completeThrough) : null;

    let start: Date;
    if (!through) {
      const first = await this.prisma.$queryRaw<Array<{ first: Date | null }>>(Prisma.sql`SELECT MIN(created_at) AS first FROM requests WHERE is_blocked = false`);
      if (!first[0]?.first) return { rebuilt: 0, completeThrough: null as string | null, note: 'no ledger rows yet' };
      start = dayStart(first[0].first);
    } else {
      start = new Date(Math.max(through.getTime() + DAY - recheck * DAY, 0));
    }

    let rebuilt = 0;
    for (let d = start; d <= yesterday && rebuilt < maxDays; d = new Date(d.getTime() + DAY)) {
      try {
        await this.rebuildDay(dayKey(d));
      } catch (err: any) {
        if (err?.code === 'P2010' || err?.code === '23505' || /duplicate key|unique/i.test(String(err?.message))) {
          this.logger.warn(`Rollup day ${dayKey(d)} was being rebuilt by another worker; leaving it to them`);
          break; // contiguity must not skip a day
        }
        throw err;
      }
      rebuilt++;
      if (!through || d > through) through = d; // only ever advances, contiguously
    }

    if (through) {
      await this.prisma.rollupState.upsert({
        where: { key: STATE_KEY },
        create: { key: STATE_KEY, completeThrough: through, lastBuildAt: now },
        update: { completeThrough: through, lastBuildAt: now },
      });
      this.invalidate();
    }
    return { rebuilt, completeThrough: through ? dayKey(through) : null, caughtUp: !!through && through >= yesterday };
  }

  /**
   * Compares the ledger with the rollup, day by day, for the last `days` complete days (all organizations) and repairs any
   * day that differs. Every discrepancy is reported and logged: a non-zero count means a ledger row arrived late, or a
   * bug, and is exactly what an operator should look at.
   */
  async reconcile(now = new Date(), days = 35) {
    const to = dayStart(now); // exclusive: yesterday is the last complete day
    const from = new Date(to.getTime() - days * DAY);
    const raw = await this.prisma.$queryRaw<Array<{ d: Date; n: bigint; ti: unknown; tout: unknown; cost: unknown }>>(Prisma.sql`
      SELECT date_trunc('day', created_at)::date AS d, COUNT(*) AS n, COALESCE(SUM(tokens_in), 0) AS ti, COALESCE(SUM(tokens_out), 0) AS tout, COALESCE(SUM(cost_estimate), 0) AS cost
      FROM requests WHERE is_blocked = false AND created_at >= ${from} AND created_at < ${to} GROUP BY 1`);
    const roll = await this.prisma.$queryRaw<Array<{ d: Date; n: bigint; ti: unknown; tout: unknown; cost: unknown }>>(Prisma.sql`
      SELECT day AS d, COALESCE(SUM(requests), 0) AS n, COALESCE(SUM(tokens_in), 0) AS ti, COALESCE(SUM(tokens_out), 0) AS tout, COALESCE(SUM(cost_usd), 0) AS cost
      FROM request_daily_rollups WHERE day >= ${from}::date AND day < ${to}::date GROUP BY 1`);
    const key = (d: Date) => dayKey(d);
    const rawBy = new Map(raw.map((r) => [key(r.d), r]));
    const rollBy = new Map(roll.map((r) => [key(r.d), r]));
    const discrepancies: Array<{ day: string; ledger: { requests: number; costUsd: number }; rollup: { requests: number; costUsd: number } }> = [];
    for (let d = from; d < to; d = new Date(d.getTime() + DAY)) {
      const k = dayKey(d);
      const a = rawBy.get(k);
      const b = rollBy.get(k);
      const same = Number(a?.n ?? 0) === Number(b?.n ?? 0) && Number(a?.ti ?? 0) === Number(b?.ti ?? 0) && Number(a?.tout ?? 0) === Number(b?.tout ?? 0) && Math.abs(Number(a?.cost ?? 0) - Number(b?.cost ?? 0)) < 1e-6;
      if (!same) discrepancies.push({ day: k, ledger: { requests: Number(a?.n ?? 0), costUsd: Number(a?.cost ?? 0) }, rollup: { requests: Number(b?.n ?? 0), costUsd: Number(b?.cost ?? 0) } });
    }
    for (const x of discrepancies) {
      this.logger.warn(`ROLLUP DISCREPANCY ${x.day}: ledger ${x.ledger.requests} rows / $${x.ledger.costUsd.toFixed(6)} vs rollup ${x.rollup.requests} rows / $${x.rollup.costUsd.toFixed(6)}; rebuilding the day from the ledger`);
      await this.rebuildDay(x.day);
    }
    await this.prisma.rollupState.upsert({
      where: { key: STATE_KEY },
      create: { key: STATE_KEY, lastReconcileAt: now, lastDiscrepancies: discrepancies.length, lastRepairedDays: discrepancies.length },
      update: { lastReconcileAt: now, lastDiscrepancies: discrepancies.length, lastRepairedDays: discrepancies.length },
    });
    this.invalidate();
    return { checkedDays: days, discrepancies, repaired: discrepancies.length };
  }

  async status() {
    const s = await this.prisma.rollupState.findUnique({ where: { key: STATE_KEY } });
    return {
      enabled: RollupService.enabled(),
      completeThrough: s?.completeThrough ? dayKey(s.completeThrough) : null,
      lastBuildAt: s?.lastBuildAt ?? null,
      lastReconcileAt: s?.lastReconcileAt ?? null,
      lastDiscrepancies: s?.lastDiscrepancies ?? 0,
      lastRepairedDays: s?.lastRepairedDays ?? 0,
    };
  }
}
