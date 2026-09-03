import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getDashboardAnalytics(projectId?: string) {
    const where: any = {};
    if (projectId) where.projectId = projectId;

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // 1. Spend Summary
    const [monthAgg, anomalyCount, blockedCount, totalProjects] = await Promise.all([
      this.prisma.request.aggregate({
        where: { ...where, createdAt: { gte: firstDayOfMonth }, isBlocked: false },
        _sum: { costEstimate: true, totalTokens: true },
        _count: { id: true },
        _avg: { latencyMs: true },
      }),
      this.prisma.request.count({
        where: { ...where, createdAt: { gte: firstDayOfMonth }, isAnomaly: true },
      }),
      this.prisma.request.count({
        where: { ...where, createdAt: { gte: firstDayOfMonth }, isBlocked: true },
      }),
      this.prisma.project.findMany({
        where: projectId ? { id: projectId } : {},
        select: { id: true, name: true, budgetMonthly: true, isBlocked: true },
      }),
    ]);

    const totalSpend = Number(monthAgg._sum.costEstimate || 0);
    const totalTokens = monthAgg._sum.totalTokens || 0;
    const totalRequests = monthAgg._count.id || 0;
    const avgLatency = Math.round(monthAgg._avg.latencyMs || 0);
    const totalBudget = totalProjects.reduce((sum, p) => sum + Number(p.budgetMonthly), 0);
    const budgetUtilizationPct = totalBudget > 0 ? Math.min(100, Math.round((totalSpend / totalBudget) * 100)) : 0;

    // 2. Past 7-Day Velocity (Guaranteed continuous 7 data points)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const pastRequests = await this.prisma.request.findMany({
      where: {
        ...where,
        createdAt: { gte: sevenDaysAgo },
        isBlocked: false,
      },
      select: { createdAt: true, costEstimate: true, totalTokens: true },
    });

    const dayMap: Record<string, { date: string; spend: number; tokens: number; requests: number }> = {};

    // Initialize 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      dayMap[dateStr] = { date: dateStr, spend: 0, tokens: 0, requests: 0 };
    }

    pastRequests.forEach((r) => {
      const dateStr = r.createdAt.toISOString().slice(0, 10);
      if (dayMap[dateStr]) {
        dayMap[dateStr].spend += Number(r.costEstimate);
        dayMap[dateStr].tokens += r.totalTokens;
        dayMap[dateStr].requests += 1;
      }
    });

    const dailySpend = Object.values(dayMap).map((d) => ({
      ...d,
      spend: Number(d.spend.toFixed(4)),
    }));

    // 3. Model Breakdown (Guaranteed well-formed non-NaN array)
    const modelGroup = await this.prisma.request.groupBy({
      by: ['model', 'provider'],
      where: { ...where, createdAt: { gte: firstDayOfMonth }, isBlocked: false },
      _sum: { costEstimate: true, totalTokens: true },
      _count: { id: true },
    });

    const modelBreakdown = modelGroup.map((m) => ({
      model: m.model,
      provider: m.provider,
      spend: Number(Number(m._sum.costEstimate || 0).toFixed(4)),
      tokens: m._sum.totalTokens || 0,
      requests: m._count.id || 0,
    })).sort((a, b) => b.spend - a.spend);

    // 4. Project Breakdown
    const projectGroup = await this.prisma.request.groupBy({
      by: ['projectId'],
      where: { createdAt: { gte: firstDayOfMonth }, isBlocked: false },
      _sum: { costEstimate: true, totalTokens: true },
      _count: { id: true },
    });

    const projectBreakdown = projectGroup.map((pg) => {
      const p = totalProjects.find((x) => x.id === pg.projectId);
      const spend = Number(Number(pg._sum.costEstimate || 0).toFixed(4));
      const budget = p ? Number(p.budgetMonthly) : 1000;
      return {
        projectId: pg.projectId,
        name: p?.name || pg.projectId,
        spend,
        budget,
        utilizationPct: budget > 0 ? Math.min(100, Math.round((spend / budget) * 100)) : 0,
        requests: pg._count.id || 0,
      };
    });

    // 5. Recent Requests (for telemetry table)
    const recentRequests = await this.prisma.request.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        project: { select: { name: true } },
        user: { select: { name: true } },
      },
    });

    return {
      summary: {
        totalSpend: Number(totalSpend.toFixed(4)),
        totalBudget,
        budgetUtilizationPct,
        totalTokens,
        totalRequests,
        avgLatency,
        anomalyCount,
        blockedCount,
      },
      dailySpend,
      modelBreakdown,
      projectBreakdown,
      recentRequests: recentRequests.map((r) => ({
        id: r.id,
        project_id: r.projectId,
        project_name: r.project?.name || r.projectId,
        user_name: r.user?.name || 'API Client',
        provider: r.provider,
        model: r.model,
        tokens_in: r.tokensIn,
        tokens_out: r.tokensOut,
        total_tokens: r.totalTokens,
        cost_estimate: Number(r.costEstimate),
        latency_ms: r.latencyMs,
        status_code: r.statusCode,
        is_anomaly: r.isAnomaly,
        anomaly_reason: r.anomalyReason,
        is_blocked: r.isBlocked,
        created_at: r.createdAt,
      })),
    };
  }
}
