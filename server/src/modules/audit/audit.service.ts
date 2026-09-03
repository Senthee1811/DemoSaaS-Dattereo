import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listLogs(params: {
    projectId?: string;
    model?: string;
    anomalyOnly?: boolean;
    blockedOnly?: boolean;
    limit?: number;
    offset?: number;
  }) {
    const where: any = {};
    if (params.projectId) where.projectId = params.projectId;
    if (params.model) where.model = params.model;
    if (params.anomalyOnly) where.isAnomaly = true;
    if (params.blockedOnly) where.isBlocked = true;

    const [logs, total] = await Promise.all([
      this.prisma.request.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: params.limit || 50,
        skip: params.offset || 0,
        include: {
          project: { select: { name: true } },
          user: { select: { name: true, email: true } },
        },
      }),
      this.prisma.request.count({ where }),
    ]);

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
        isAnomaly: l.isAnomaly,
        anomalyReason: l.anomalyReason,
        isBlocked: l.isBlocked,
        promptPreview: l.promptPreview,
        responsePreview: l.responsePreview,
        timestamp: l.createdAt,
      })),
      total,
    };
  }

  async generateCsv(projectId?: string): Promise<string> {
    const where: any = {};
    if (projectId) where.projectId = projectId;

    const records = await this.prisma.request.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
      include: {
        project: { select: { name: true } },
        user: { select: { name: true, email: true } },
      },
    });

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
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = [
      headers.join(','),
      ...records.map((r) =>
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
        ].join(','),
      ),
    ];

    return rows.join('\r\n');
  }
}
