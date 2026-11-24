import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

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
        estimatedCostUsd: Number(a.estimatedCostUsd),
        durationMs: a.durationMs,
        timestamp: a.createdAt,
      })),
      total,
    };
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
