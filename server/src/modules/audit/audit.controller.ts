import { Controller, Get, Query, Res, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { AuditService } from './audit.service';
import { CurrentUser, AuthenticatedUser } from '@/modules/auth/decorators/current-user.decorator';

@ApiTags('Audit & Compliance')
@ApiBearerAuth()
@Controller('api/v1/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List immutable audit logs with filter criteria' })
  async getLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Query('projectId') projectId?: string,
    @Query('model') model?: string,
    @Query('provider') provider?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('anomalyOnly') anomalyOnly?: string,
    @Query('blockedOnly') blockedOnly?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;
    return this.auditService.listLogs({
      orgId: user.orgId,
      projectId,
      model,
      provider,
      search,
      status: status ? parseInt(status, 10) : undefined,
      startDate,
      endDate,
      anomalyOnly: anomalyOnly === 'true',
      blockedOnly: blockedOnly === 'true',
      limit: Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 500) : 50,
      offset: Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0,
    });
  }

  @Get('export')
  @ApiOperation({ summary: 'Export audit logs as RFC-compliant CSV' })
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query('projectId') projectId: string,
    @Res() res: Response,
  ) {
    const csvContent = await this.auditService.generateCsv(user.orgId, projectId);
    const filename = `spendguard-audit-export-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(HttpStatus.OK).send(csvContent);
  }
}
