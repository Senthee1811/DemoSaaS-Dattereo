import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

export interface CreateProjectDto {
  name: string;
  slug?: string;
  description?: string;
  budgetMonthly: number;
  budgetWeekly?: number;
  budgetHardBlockEnabled?: boolean;
}

export interface UpdateProjectDto {
  id: string;
  name?: string;
  budgetMonthly?: number;
  budgetWeekly?: number;
  budgetHardBlockEnabled?: boolean;
  isBlocked?: boolean;
  blockReason?: string;
}

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listProjects(orgId: string) {
    const projects = await this.prisma.project.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { requests: true },
        },
      },
    });

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());

    const enriched = await Promise.all(
      projects.map(async (p) => {
        const monthlyAgg = await this.prisma.request.aggregate({
          where: {
            projectId: p.id,
            createdAt: { gte: firstDayOfMonth },
            isBlocked: false,
          },
          _sum: { costEstimate: true },
        });

        const weeklyAgg = await this.prisma.request.aggregate({
          where: {
            projectId: p.id,
            createdAt: { gte: firstDayOfWeek },
            isBlocked: false,
          },
          _sum: { costEstimate: true },
        });

        const currentMonthlySpend = Number(monthlyAgg._sum.costEstimate || 0);
        const currentWeeklySpend = Number(weeklyAgg._sum.costEstimate || 0);
        const budgetMonthly = Number(p.budgetMonthly);
        const utilizationPct = budgetMonthly > 0 ? Math.min(100, Math.round((currentMonthlySpend / budgetMonthly) * 100)) : 0;

        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          description: p.description,
          budgetMonthly,
          budgetWeekly: Number(p.budgetWeekly),
          budgetHardBlockEnabled: p.budgetHardBlockEnabled,
          isBlocked: p.isBlocked,
          blockReason: p.blockReason,
          currentMonthlySpend,
          currentWeeklySpend,
          utilizationPct,
          requestCount: p._count.requests,
          createdAt: p.createdAt,
        };
      }),
    );

    return { projects: enriched };
  }

  async createProject(dto: CreateProjectDto, orgId: string) {
    const name = (dto.name || '').trim();
    if (!name) {
      throw new BadRequestException('Project name is required');
    }

    const budgetMonthly = Number(dto.budgetMonthly) || 1000;
    if (budgetMonthly <= 0) {
      throw new BadRequestException('Monthly budget must be greater than zero');
    }
    const budgetWeekly = Number(dto.budgetWeekly) || budgetMonthly / 4;
    const slug = (dto.slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';

    const clash = await this.prisma.project.findUnique({ where: { orgId_slug: { orgId, slug } } });
    if (clash) {
      throw new ConflictException(`A project with slug '${slug}' already exists in this organization`);
    }

    const project = await this.prisma.project.create({
      data: {
        orgId,
        name,
        slug,
        description: dto.description,
        budgetMonthly,
        budgetWeekly,
        budgetHardBlockEnabled: dto.budgetHardBlockEnabled !== false,
      },
    });

    return { project };
  }

  async updateProject(dto: UpdateProjectDto, orgId: string) {
    const existing = dto.id
      ? await this.prisma.project.findUnique({ where: { id: dto.id } })
      : null;

    if (!existing || existing.orgId !== orgId) {
      throw new NotFoundException(`Project ${dto.id} not found in this organization`);
    }

    const dataToUpdate: any = {};
    if (dto.name !== undefined) dataToUpdate.name = dto.name;
    if (dto.budgetMonthly !== undefined) dataToUpdate.budgetMonthly = dto.budgetMonthly;
    if (dto.budgetWeekly !== undefined) dataToUpdate.budgetWeekly = dto.budgetWeekly;
    if (dto.budgetHardBlockEnabled !== undefined) dataToUpdate.budgetHardBlockEnabled = dto.budgetHardBlockEnabled;
    if (dto.isBlocked !== undefined) {
      dataToUpdate.isBlocked = dto.isBlocked;
      dataToUpdate.blockReason = dto.isBlocked ? (dto.blockReason || 'Manual Admin Emergency Freeze') : null;
    }

    const updated = await this.prisma.project.update({
      where: { id: dto.id },
      data: dataToUpdate,
    });

    return { project: updated };
  }
}
