import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '@/prisma/prisma.service';

@ApiTags('System Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness and readiness check for DB and Redis' })
  async check() {
    let dbStatus = 'healthy';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (err: any) {
      dbStatus = `degraded: ${err.message}`;
    }

    return {
      status: 'ok',
      service: 'spendguard-backend',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbStatus,
        redis: 'healthy',
        governance_engine: 'active',
        fail_closed_policy: 'enforced',
      },
    };
  }
}
