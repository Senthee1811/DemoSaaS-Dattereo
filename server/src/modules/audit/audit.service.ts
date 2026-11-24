import { Injectable, Logger, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { assessMargin, MIN_SAMPLES_PER_MODEL } from '@/modules/gateway/estimator-accuracy';

/**
 * Audit service — enforces append-only immutability.
 * No update method exists in this service layer.
 * Per Step 8: "Enforce that AuditLog rows are append-only —
 * no update method should exist in the service layer."
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Append a new immutable audit log entry.
   */
  async appendLog(data: {
    requestId?: string;
    actor: string;
    action: string;
    metadata?: any;
  }) {
    return this.prisma.auditLog.create({
      data: {
        requestId: data.requestId || null,
        actor: data.actor,
        action: data.action,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      },
    });
  }

  async listLogs(params: {
    orgId: string;
    projectId?: string;
    model?: string;
    provider?: string;
    search?: string;
    status?: number;
    startDate?: string;
    endDate?: string;
    anomalyOnly?: boolean;
    blockedOnly?: boolean;
    limit?: number;
    offset?: number;
    /** Caller's role: MEMBERs never receive prompt/response previews. */
    role?: string;
  }) {
    const where: any = { project: { orgId: params.orgId } };
    if (params.projectId) where.projectId = params.projectId;
    if (params.model) where.model = params.model;
    if (params.provider) where.provider = params.provider.toUpperCase();
    if (params.status) where.statusCode = Number(params.status);
    if (params.anomalyOnly) where.isAnomaly = true;
    if (params.blockedOnly) where.isBlocked = true;

    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) where.createdAt.gte = new Date(params.startDate);
      if (params.endDate) where.createdAt.lte = new Date(params.endDate);
    }

    if (params.search) {
      where.OR = [
        { id: { contains: params.search, mode: 'insensitive' } },
        { model: { contains: params.search, mode: 'insensitive' } },
        { anomalyReason: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [logs, total] = await Promise.all([
      this.prisma.request.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: params.limit || 50,
        skip: params.offset || 0,
        include: {
          project: { select: { name: true, logRequestContent: true } },
          user: { select: { name: true, email: true } },
        },
      }),
      this.prisma.request.count({ where }),
    ]);

    // Previews only for OWNER/ADMIN, and only while the project opts in to content
    // logging (legacy rows stored before the opt-in existed stay hidden).
    const canSeeContent = (l: (typeof logs)[number]) =>
      params.role !== undefined && params.role !== 'MEMBER' && l.project?.logRequestContent === true;

    return {
      logs: logs.map((l) => ({
        id: l.id,
        projectId: l.projectId,
        projectName: l.project?.name,
        userId: l.userId,
        userName: l.user?.name || 'API Client',
        userEmail: l.user?.email || 'api@spendguard.ai',
        provider: l.provider,
        model: l.model,
        tokensIn: l.tokensIn,
        tokensOut: l.tokensOut,
        totalTokens: l.totalTokens,
        costEstimate: Number(l.costEstimate),
        latencyMs: l.latencyMs,
        statusCode: l.statusCode,
        // isAnomaly is true only for a CONFIRMED anomaly; anomalyStatus distinguishes
        // PENDING / CLEAR / ANOMALY / FAILED / SKIPPED
        isAnomaly: l.isAnomaly,
        anomalyStatus: l.anomalyStatus,
        anomalyReason: l.anomalyReason,
        reservedCost: l.reservedCostUsd != null ? Number(l.reservedCostUsd) : null,
        reservationOverrun: Number(l.reservationOverrunUsd ?? 0),
        isBlocked: l.isBlocked,
        ...(canSeeContent(l) ? { promptPreview: l.promptPreview, responsePreview: l.responsePreview } : {}),
        timestamp: l.createdAt,
      })),
      total,
    };
  }

  /**
   * Failed gateway calls (provider errors, timeouts, bad provider keys) for the caller's organization.
   * Never includes spend: `estimatedCostUsd` is the worst-case reservation that was released.
   * Tenant scope is the row's own `orgId`, so another organization's attempts are unreachable by id.
   */
  async listAttempts(params: {
    orgId: string;
    projectId?: string;
    gatewayKeyId?: string;
    errorClass?: string;
    provider?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: any = { orgId: params.orgId };
    if (params.projectId) where.projectId = params.projectId;
    if (params.gatewayKeyId) where.gatewayKeyId = params.gatewayKeyId;
    if (params.errorClass) where.errorClass = params.errorClass;
    if (params.provider) where.provider = params.provider.toUpperCase();
    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) where.createdAt.gte = new Date(params.startDate);
      if (params.endDate) where.createdAt.lte = new Date(params.endDate);
    }
    const [rows, total] = await Promise.all([
      this.prisma.requestAttempt.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: params.limit || 50,
        skip: params.offset || 0,
        include: { project: { select: { name: true } } },
      }),
      this.prisma.requestAttempt.count({ where }),
    ]);
    return {
      attempts: rows.map((a) => ({
        id: a.id,
        projectId: a.projectId,
        projectName: a.project?.name,
        gatewayKeyId: a.gatewayKeyId,
        provider: a.provider,
        model: a.model,
        errorClass: a.errorClass,
        httpStatus: a.httpStatus,
        upstreamStatus: a.upstreamStatus,
        upstreamCode: a.upstreamCode,
        // The worst case that could have been charged, NOT a charge. See billingStatus for whether one is expected.
        estimatedCostUsd: Number(a.estimatedCostUsd),
        executionStatus: a.executionStatus,
        billingStatus: a.billingStatus,
        reconciledStatus: a.reconciledStatus,
        reconciledCostUsd: a.reconciledCostUsd != null ? Number(a.reconciledCostUsd) : null,
        reconciledAt: a.reconciledAt,
        durationMs: a.durationMs,
        timestamp: a.createdAt,
      })),
      total,
    };
  }

  /**
   * How well the token estimator predicted real usage, per provider/model/estimator version, from ledger numbers only.
   * Only rows whose usage the PROVIDER reported (usage_status = CONFIRMED) are scored: an estimate cannot validate an estimate.
   */
  async estimatorAccuracy(orgId: string, days = 30) {
    const d = Math.min(Math.max(Math.floor(days) || 30, 1), 180);
    const since = new Date(Date.now() - d * 86_400_000);
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT r.provider::text AS provider, r.model, r.estimator_version,
        COUNT(*) FILTER (WHERE r.usage_status = 'CONFIRMED' AND r.estimated_input_tokens IS NOT NULL AND r.tokens_in > 0) AS samples,
        COUNT(*) FILTER (WHERE r.usage_status = 'ESTIMATED') AS estimated_usage_rows,
        COUNT(*) FILTER (WHERE r.usage_status IS NULL OR r.estimated_input_tokens IS NULL) AS unscored_rows,
        COUNT(*) FILTER (WHERE r.usage_status = 'CONFIRMED' AND r.estimated_input_tokens < r.tokens_in) AS under_raw,
        COUNT(*) FILTER (WHERE r.usage_status = 'CONFIRMED' AND r.estimated_input_tokens > r.tokens_in) AS over_raw,
        COUNT(*) FILTER (WHERE r.usage_status = 'CONFIRMED' AND r.reserved_input_tokens < r.tokens_in) AS under_reserved,
        COUNT(*) FILTER (WHERE r.usage_status = 'CONFIRMED' AND r.reserved_input_tokens > r.tokens_in) AS over_reserved,
        COUNT(*) FILTER (WHERE r.usage_status = 'CONFIRMED' AND r.reserved_output_tokens < r.tokens_out) AS output_exceeded_reserve,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY r.estimated_input_tokens::float8 / r.tokens_in) FILTER (WHERE r.usage_status = 'CONFIRMED' AND r.estimated_input_tokens IS NOT NULL AND r.tokens_in > 0) AS ratio_p50,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY r.estimated_input_tokens::float8 / r.tokens_in) FILTER (WHERE r.usage_status = 'CONFIRMED' AND r.estimated_input_tokens IS NOT NULL AND r.tokens_in > 0) AS ratio_p95,
        percentile_cont(0.99) WITHIN GROUP (ORDER BY r.tokens_in::float8 / NULLIF(r.estimated_input_tokens, 0)) FILTER (WHERE r.usage_status = 'CONFIRMED' AND r.estimated_input_tokens > 0) AS margin_needed_p99,
        COALESCE(SUM(r.cost_estimate) FILTER (WHERE r.usage_status = 'CONFIRMED'), 0) AS cost,
        COALESCE(SUM(r.reservation_overrun_usd) FILTER (WHERE r.usage_status = 'CONFIRMED'), 0) AS overrun,
        COUNT(*) FILTER (WHERE r.usage_status = 'CONFIRMED' AND r.reservation_overrun_usd > 0) AS overrun_requests,
        COALESCE(SUM(r.cost_estimate * ABS(r.estimated_input_tokens::float8 / r.tokens_in - 1)) FILTER (WHERE r.usage_status = 'CONFIRMED' AND r.estimated_input_tokens IS NOT NULL AND r.tokens_in > 0), 0)
          / NULLIF(SUM(r.cost_estimate) FILTER (WHERE r.usage_status = 'CONFIRMED' AND r.estimated_input_tokens IS NOT NULL AND r.tokens_in > 0), 0) AS cost_weighted_error,
        MIN(r.created_at) FILTER (WHERE r.usage_status = 'CONFIRMED' AND r.estimated_input_tokens IS NOT NULL) AS first_at,
        MAX(r.created_at) FILTER (WHERE r.usage_status = 'CONFIRMED' AND r.estimated_input_tokens IS NOT NULL) AS last_at
      FROM requests r JOIN projects p ON p.id = r.project_id
      WHERE p.org_id = ${orgId} AND r.is_blocked = false AND r.created_at >= ${since}
      GROUP BY r.provider, r.model, r.estimator_version
      ORDER BY cost DESC`);
    const n = (v: unknown) => Number(v ?? 0);
    const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 10000) / 100 : null);
    const groups = rows.map((r) => {
      const samples = n(r.samples);
      return {
        provider: r.provider, model: r.model, estimatorVersion: r.estimator_version, samples,
        indicativeOnly: samples < MIN_SAMPLES_PER_MODEL,
        excluded: { estimatedUsage: n(r.estimated_usage_rows), unscored: n(r.unscored_rows) },
        underestimatedPct: pct(n(r.under_raw), samples), overestimatedPct: pct(n(r.over_raw), samples),
        reservationUnderCoveredInputPct: pct(n(r.under_reserved), samples), reservationOverCoveredInputPct: pct(n(r.over_reserved), samples),
        outputExceededReservePct: pct(n(r.output_exceeded_reserve), samples),
        estimateToActualRatio: { p50: r.ratio_p50 == null ? null : Math.round(n(r.ratio_p50) * 1000) / 1000, p95: r.ratio_p95 == null ? null : Math.round(n(r.ratio_p95) * 1000) / 1000 },
        marginNeededForP99Coverage: r.margin_needed_p99 == null ? null : Math.round(n(r.margin_needed_p99) * 1000) / 1000,
        costWeightedErrorPct: r.cost_weighted_error == null ? null : Math.round(n(r.cost_weighted_error) * 10000) / 100,
        financialOverrun: { requests: n(r.overrun_requests), usd: n(r.overrun), pctOfCost: pct(n(r.overrun), n(r.cost)) },
        _span: r.first_at && r.last_at ? (new Date(r.last_at).getTime() - new Date(r.first_at).getTime()) / 86_400_000 : 0,
        _under: pct(n(r.under_reserved), samples),
      };
    });
    const byProvider = new Map<string, { samples: number; span: number; weightedUnder: number }>();
    for (const g of groups) {
      const e = byProvider.get(g.provider) ?? { samples: 0, span: 0, weightedUnder: 0 };
      e.samples += g.samples;
      e.span = Math.max(e.span, g._span);
      e.weightedUnder += (g._under ?? 0) * g.samples;
      byProvider.set(g.provider, e);
    }
    return {
      windowDays: d,
      note: 'Computed from ledger counts only (no prompts or responses). Rows with estimated usage are excluded. Margins are never changed automatically.',
      providers: [...byProvider].map(([provider, e]) => ({ provider, ...assessMargin({ providerSamples: e.samples, spanDays: e.span, underReservedPct: e.samples ? Math.round((e.weightedUnder / e.samples) * 100) / 100 : null }) })),
      groups: groups.map(({ _span, _under, ...g }) => g),
    };
  }

  /**
   * Failed calls where the provider may have billed us but no usage reached the ledger, not yet compared with the
   * provider's invoice. This is EXPOSURE, not spend: nothing here is in the ledger or the budget counters.
   *  - maxExposureUsd: the sum of the worst cases that were reserved and released (an upper bound, not a charge)
   *  - confirmedUnledgeredUsd: provider-confirmed charges a human recorded; still not in the ledger (manual accounting)
   */
  async attemptExposure(orgId: string) {
    const [open, confirmed] = await Promise.all([
      this.prisma.requestAttempt.groupBy({
        by: ['provider', 'billingStatus'],
        where: { orgId, billingStatus: { in: ['UNCERTAIN', 'LIKELY_CHARGED'] }, reconciledStatus: null },
        _count: { id: true },
        _sum: { estimatedCostUsd: true },
      }),
      this.prisma.requestAttempt.groupBy({
        by: ['provider'],
        where: { orgId, reconciledStatus: 'CHARGED_CONFIRMED' },
        _count: { id: true },
        _sum: { reconciledCostUsd: true },
      }),
    ]);
    return {
      unreconciled: open.map((r) => ({ provider: r.provider, billingStatus: r.billingStatus, attempts: r._count.id, maxExposureUsd: Number(r._sum.estimatedCostUsd ?? 0) })),
      confirmedUnledgeredUsd: confirmed.map((r) => ({ provider: r.provider, attempts: r._count.id, usd: Number(r._sum.reconciledCostUsd ?? 0) })),
      note: 'Exposure is an upper bound from released reservations, not a charge. Confirm against the provider invoice, then record the outcome per attempt.',
    };
  }

  /**
   * Records a human's comparison of one failed attempt with the provider invoice. It changes NOTHING in the spend ledger
   * or the budget counters (a charge discovered later is an accounting correction made outside SpendGuard).
   */
  async reconcileAttempt(orgId: string, userId: string, id: string, body: { status?: string; costUsd?: number; note?: string }) {
    const row = await this.prisma.requestAttempt.findFirst({ where: { id, orgId } }); // another tenant's id is a 404
    if (!row) throw new NotFoundException('Attempt not found');
    if (row.reconciledStatus) throw new BadRequestException('This attempt has already been reconciled.');
    const status = String(body?.status ?? '');
    if (status !== 'NOT_CHARGED_CONFIRMED' && status !== 'CHARGED_CONFIRMED') throw new BadRequestException('status must be NOT_CHARGED_CONFIRMED or CHARGED_CONFIRMED');
    let cost: number | null = null;
    if (status === 'CHARGED_CONFIRMED') {
      cost = Number(body?.costUsd);
      if (!Number.isFinite(cost) || cost <= 0 || cost > 100000) throw new BadRequestException('costUsd (the amount on the provider invoice) is required for CHARGED_CONFIRMED');
    } else if (body?.costUsd !== undefined && Number(body.costUsd) !== 0) {
      throw new BadRequestException('costUsd must be omitted (or 0) for NOT_CHARGED_CONFIRMED');
    }
    const updated = await this.prisma.requestAttempt.update({
      where: { id },
      data: { reconciledStatus: status, reconciledCostUsd: cost, reconciledById: userId, reconciledAt: new Date(), reconciledNote: typeof body?.note === 'string' ? body.note.slice(0, 300) : null },
    });
    await this.prisma.auditLog.create({ data: { orgId, actor: userId, action: 'attempt.reconciled', metadata: JSON.stringify({ attemptId: id, status, costUsd: cost }) } }).catch((e: any) => this.logger.error(`AUDIT WRITE FAILED for attempt.reconciled ${id}: ${e?.message}`));
    return { id: updated.id, reconciledStatus: updated.reconciledStatus, reconciledCostUsd: updated.reconciledCostUsd != null ? Number(updated.reconciledCostUsd) : null, reconciledAt: updated.reconciledAt };
  }

  /**
   * Streamed/paginated CSV export — uses cursor-based pagination
   * to avoid loading the full table into memory for large orgs.
   * Per Step 8: "Build a paginated/streamed CSV export endpoint."
   */
  async generateCsv(orgId: string, projectId?: string): Promise<string> {
    const where: any = { project: { orgId } };
    if (projectId) where.projectId = projectId;

    const headers = [
      'Request ID',
      'Timestamp (UTC)',
      'Project Name',
      'User Name',
      'User Email',
      'AI Provider',
      'Model',
      'Prompt Tokens',
      'Completion Tokens',
      'Total Tokens',
      'Cost Estimate (USD)',
      'Latency (ms)',
      'HTTP Status',
      'Is Anomaly',
      'Anomaly Reason',
      'Is Hard Blocked',
      // Appended (existing column positions are unchanged): "Is Anomaly" is YES only for a confirmed anomaly
      'Anomaly Status',
      'Reserved (USD)',
      'Reservation Overrun (USD)',
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      let str = String(val);
      // Neutralise spreadsheet formula injection (=, +, -, @, tab, CR)
      if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
      return `"${str.replace(/"/g, '""')}"`;
    };

    const chunks: string[] = [headers.join(',')];
    const batchSize = 500;
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const records = await this.prisma.request.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: batchSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        include: {
          project: { select: { name: true } },
          user: { select: { name: true, email: true } },
        },
      });

      if (records.length === 0) {
        hasMore = false;
        break;
      }

      for (const r of records) {
        chunks.push(
          [
            escapeCsv(r.id),
            escapeCsv(r.createdAt.toISOString()),
            escapeCsv(r.project?.name || r.projectId),
            escapeCsv(r.user?.name || 'API Client'),
            escapeCsv(r.user?.email || 'api@spendguard.ai'),
            escapeCsv(r.provider),
            escapeCsv(r.model),
            r.tokensIn,
            r.tokensOut,
            r.totalTokens,
            Number(r.costEstimate).toFixed(6),
            r.latencyMs,
            r.statusCode,
            r.isAnomaly ? 'YES' : 'NO',
            escapeCsv(r.anomalyReason || ''),
            r.isBlocked ? 'YES' : 'NO',
            escapeCsv(r.anomalyStatus),
            r.reservedCostUsd != null ? Number(r.reservedCostUsd).toFixed(6) : '',
            Number(r.reservationOverrunUsd ?? 0).toFixed(6),
          ].join(','),
        );
      }

      cursor = records[records.length - 1].id;
      if (records.length < batchSize) {
        hasMore = false;
      }
    }

    return chunks.join('\r\n');
  }

  /**
   * Explicitly forbidden — audit log entries are immutable.
   * This method exists solely to enforce the immutability constraint.
   */
  async updateLog(): Promise<never> {
    throw new ForbiddenException(
      'Audit log entries are immutable. Updates are rejected by governance policy.',
    );
  }
}
