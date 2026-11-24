import { Controller, Get, Query, Res, HttpStatus, BadRequestException } from '@nestjs/common';

function assertDate(name: string, value?: string) {
  if (value !== undefined && value !== '' && Number.isNaN(Date.parse(value))) {
    throw new BadRequestException(`${name} must be an ISO 8601 date`);
  }
}
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
    assertDate('startDate', startDate);
    assertDate('endDate', endDate);
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
      role: user.role,
    });
  }

  @Get('attempts')
  @ApiOperation({ summary: 'List failed gateway calls (provider errors, timeouts, rejected provider keys). No spend, no content.' })
  async getAttempts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('projectId') projectId?: string,
    @Query('gatewayKeyId') gatewayKeyId?: string,
    @Query('errorClass') errorClass?: string,
    @Query('provider') provider?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    assertDate('startDate', startDate);
    assertDate('endDate', endDate);
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;
    return this.auditService.listAttempts({
      orgId: user.orgId, // always the caller's organization, never a client-supplied one
      projectId,
      gatewayKeyId,
      errorClass,
      provider,
      startDate,
      endDate,
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
