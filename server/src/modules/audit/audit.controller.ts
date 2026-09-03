import { Controller, Get, Query, Res, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { AuditService } from './audit.service';

@ApiTags('Audit & Compliance')
@Controller('api/v1/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List immutable audit logs with filter criteria' })
  async getLogs(
    @Query('projectId') projectId?: string,
    @Query('model') model?: string,
    @Query('anomalyOnly') anomalyOnly?: string,
    @Query('blockedOnly') blockedOnly?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.auditService.listLogs({
      projectId,
      model,
      anomalyOnly: anomalyOnly === 'true',
      blockedOnly: blockedOnly === 'true',
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Get('export')
  @ApiOperation({ summary: 'Export audit logs as RFC-compliant CSV' })
  async exportCsv(@Query('projectId') projectId: string, @Res() res: Response) {
    const csvContent = await this.auditService.generateCsv(projectId);
    const filename = `spendguard-audit-export-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(HttpStatus.OK).send(csvContent);
  }
}
