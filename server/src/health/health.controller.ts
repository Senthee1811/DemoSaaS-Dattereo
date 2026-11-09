import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';

@ApiTags('System Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness and readiness check for DB and Redis' })
  async check() {
    let dbStatus = 'healthy';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (err: any) {
      dbStatus = `degraded: ${err.message}`;
    }

    const redisStatus = await this.redisService.healthCheck();

    const allHealthy = dbStatus === 'healthy' && redisStatus === 'healthy';

    return {
      status: allHealthy ? 'ok' : 'degraded',
      service: 'spendguard-backend',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbStatus,
        redis: redisStatus,
        governance_engine: 'active',
        fail_closed_policy: 'enforced',
      },
    };
  }
}
