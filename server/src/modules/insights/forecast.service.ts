import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { utcMonthStart } from '@/common/billing-period';
import { computeForecast, ForecastResult } from './calc/forecast.calc';
import { InsightsDataService } from './insights.data';

@Injectable()
export class ForecastService {
  constructor(
    private readonly data: InsightsDataService,
    private readonly prisma: PrismaService,
  ) {}

  /** Month-end forecast for one project or the whole organization (budget = sum of its projects' monthly budgets). */
  async forecast(orgId: string, projectId?: string, now = new Date()): Promise<ForecastResult & { scope: { projectId: string | null; budgetScope: 'project' | 'organization' } }> {
    const project = await this.data.assertScope(orgId, projectId);
    const monthStart = utcMonthStart(now);
    const [daily, first, budget] = await Promise.all([
      this.data.dailySpend(orgId, projectId, monthStart, new Date(now.getTime() + 1)),
      this.data.firstActivityDate(orgId, projectId),
      project
        ? Promise.resolve(Number(project.budgetMonthly))
        : this.prisma.project.aggregate({ where: { orgId }, _sum: { budgetMonthly: true } }).then((a) => (a._sum.budgetMonthly ? Number(a._sum.budgetMonthly) : null)),
    ]);
    return {
      ...computeForecast({ now, daily, firstActivityDate: first, budgetUsd: budget }),
      scope: { projectId: projectId ?? null, budgetScope: project ? 'project' : 'organization' },
    };
  }
}
