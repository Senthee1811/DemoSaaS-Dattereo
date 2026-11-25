import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Retention for `request_attempts` (failed gateway calls). OFF unless ATTEMPT_RETENTION_DAYS is set to a positive number:
 * deleting audit records is irreversible and is a business decision, so the default keeps everything.
 *
 * What may be deleted, once older than the retention period:
 *   - attempts classified NOT_EXPECTED (the provider rejected them or they were never sent: no money involved)
 *   - attempts a human reconciled as NOT_CHARGED_CONFIRMED
 * What is NEVER deleted, whatever the age:
 *   - UNCERTAIN / LIKELY_CHARGED attempts that are not yet reconciled (they are open financial exposure)
 *   - attempts reconciled as CHARGED_CONFIRMED (they are the evidence of a charge booked outside the ledger)
 *   - attempts with no classification (rows from before classification existed: their status is unknown, so they are kept)
 * The spend ledger (`requests`) is not touched by this service in any way. Every purge is recorded in `audit_log`.
 */
@Injectable()
export class AttemptRetentionService {
  private readonly logger = new Logger(AttemptRetentionService.name);
  constructor(private readonly prisma: PrismaService) {}

  /** Retention period in days, or 0 when disabled. A value below 30 days is raised to 30 (a typo must not wipe recent evidence). */
  static days(): number {
    const n = Math.floor(Number(process.env.ATTEMPT_RETENTION_DAYS));
    return Number.isFinite(n) && n > 0 ? Math.max(30, n) : 0;
  }

  async purge(now = new Date(), opts: { batchSize?: number; maxBatches?: number } = {}): Promise<{ enabled: boolean; deleted: number; cutoff: string | null }> {
    const days = AttemptRetentionService.days();
    if (!days) return { enabled: false, deleted: 0, cutoff: null };
    const cutoff = new Date(now.getTime() - days * 86_400_000);
    const batchSize = opts.batchSize ?? 1000;
    const maxBatches = opts.maxBatches ?? 50;
    let deleted = 0;
    for (let i = 0; i < maxBatches; i++) {
      const rows = await this.prisma.requestAttempt.findMany({
        where: { createdAt: { lt: cutoff }, OR: [{ billingStatus: 'NOT_EXPECTED' }, { reconciledStatus: 'NOT_CHARGED_CONFIRMED' }] },
        select: { id: true },
        take: batchSize,
      });
      if (!rows.length) break;
      const res = await this.prisma.requestAttempt.deleteMany({
        // The same protection again at delete time: a row reconciled as charged, or still uncertain, can never match
        where: { id: { in: rows.map((r) => r.id) }, NOT: [{ reconciledStatus: 'CHARGED_CONFIRMED' }, { billingStatus: { in: ['UNCERTAIN', 'LIKELY_CHARGED'] }, reconciledStatus: null }] },
      });
      deleted += res.count;
      if (rows.length < batchSize) break;
    }
    if (deleted > 0) {
      this.logger.log(`Retention removed ${deleted} failed-call records older than ${days} days`);
      await this.prisma.auditLog
        .create({ data: { actor: 'system', action: 'attempts.retention_purged', metadata: JSON.stringify({ deleted, retentionDays: days, cutoff: cutoff.toISOString() }) } })
        .catch((e: any) => this.logger.error(`AUDIT WRITE FAILED for attempts.retention_purged: ${e?.message}`));
    }
    return { enabled: true, deleted, cutoff: cutoff.toISOString() };
  }
}
