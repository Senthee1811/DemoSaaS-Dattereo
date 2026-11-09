import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { EncryptionService } from '@/modules/encryption/encryption.service';
import { RedisService } from '@/modules/redis/redis.service';

export interface StoreProviderKeyDto {
  projectId: string;
  provider: 'OPENAI' | 'ANTHROPIC' | 'GEMINI';
  keyName: string;
  plainKey: string;
}

export interface GenerateGatewayKeyDto {
  projectId: string;
  keyName: string;
  environment?: 'live' | 'test';
  rateLimitRpm?: number;
  rateLimitTpm?: number;
  allowedProviders?: string[];
  allowedModels?: string[];
  budgetMonthly?: number;
  expiresAt?: string;
}

@Injectable()
export class KeysService {
  private readonly logger = new Logger(KeysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly redisService: RedisService,
  ) {}

  async listKeys(projectId?: string) {
    const whereClause: any = {};
    if (projectId) whereClause.projectId = projectId;

    const providerKeys = await this.prisma.providerApiKey.findMany({
      where: whereClause,
      include: { project: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const gatewayKeys = await this.prisma.gatewayApiKey.findMany({
      where: whereClause,
      include: { project: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      providerKeys: providerKeys.map((pk) => ({
        id: pk.id,
        projectId: pk.projectId,
        projectName: pk.project?.name,
        provider: pk.provider,
        keyName: pk.keyName,
        keyPrefix: pk.keyPrefix,
        maskedPreview: pk.maskedPreview || `${pk.keyPrefix.slice(0, 3)}...${pk.keyPrefix.slice(-4)}`,
        isActive: pk.isActive,
        lastUsedAt: pk.lastUsedAt,
        createdAt: pk.createdAt,
      })),
      gatewayKeys: gatewayKeys.map((gk) => ({
        id: gk.id,
        projectId: gk.projectId,
        projectName: gk.project?.name,
        keyName: gk.keyName,
        keyPrefix: gk.keyPrefix,
        environment: gk.environment,
        allowedProviders: gk.allowedProviders ? JSON.parse(gk.allowedProviders) : null,
        allowedModels: gk.allowedModels ? JSON.parse(gk.allowedModels) : null,
        budgetMonthly: gk.budgetMonthly ? Number(gk.budgetMonthly) : null,
        expiresAt: gk.expiresAt,
        rateLimitRpm: gk.rateLimitRpm,
        rateLimitTpm: gk.rateLimitTpm,
        isActive: gk.isActive,
        lastUsedAt: gk.lastUsedAt,
        createdAt: gk.createdAt,
      })),
    };
  }

  async storeProviderKey(dto: StoreProviderKeyDto) {
    if (!dto.plainKey || !dto.keyName || !dto.projectId) {
      throw new BadRequestException('Missing required key parameters');
    }

    const encryptedKey = this.encryptionService.encryptApiKey(dto.plainKey);
    const keyPrefix = dto.plainKey.slice(0, 7);
    const maskedPreview = this.encryptionService.maskApiKey(dto.plainKey);

    const key = await this.prisma.providerApiKey.create({
      data: {
        projectId: dto.projectId,
        provider: dto.provider,
        keyName: dto.keyName,
        keyPrefix,
        encryptedKey,
        maskedPreview,
        isActive: true,
      },
    });

    this.logger.log(`Stored encrypted provider key [${dto.provider}] for project ${dto.projectId} with preview: ${maskedPreview}`);

    return {
      id: key.id,
      projectId: key.projectId,
      provider: key.provider,
      keyName: key.keyName,
      keyPrefix: key.keyPrefix,
      maskedPreview,
      createdAt: key.createdAt,
    };
  }

  async generateGatewayKey(dto: GenerateGatewayKeyDto) {
    if (!dto.keyName || !dto.projectId) {
      throw new BadRequestException('Missing required key parameters');
    }

    const prefix = dto.environment === 'test' ? 'sg_test' : 'sg_live';
    const { secret, keyPrefix, hashedSecret } = this.encryptionService.generateGatewaySecret(prefix);

    const key = await this.prisma.gatewayApiKey.create({
      data: {
        projectId: dto.projectId,
        keyName: dto.keyName,
        keyPrefix,
        hashedSecret,
        environment: dto.environment || 'live',
        allowedProviders: dto.allowedProviders ? JSON.stringify(dto.allowedProviders) : null,
        allowedModels: dto.allowedModels ? JSON.stringify(dto.allowedModels) : null,
        budgetMonthly: dto.budgetMonthly ? dto.budgetMonthly : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        rateLimitRpm: dto.rateLimitRpm || 1200,
        rateLimitTpm: dto.rateLimitTpm || 100000,
        isActive: true,
      },
    });

    this.logger.log(`Generated SpendGuard virtual key [${key.environment}] ${keyPrefix}... for project ${dto.projectId}`);

    return {
      id: key.id,
      projectId: key.projectId,
      keyName: key.keyName,
      keyPrefix: key.keyPrefix,
      environment: key.environment,
      secret, // Returned ONLY once upon creation per PRD
      createdAt: key.createdAt,
    };
  }

  async revokeKey(id: string, type: 'PROVIDER' | 'GATEWAY') {
    if (type === 'PROVIDER') {
      await this.prisma.providerApiKey.delete({ where: { id } });
    } else {
      const key = await this.prisma.gatewayApiKey.findUnique({ where: { id } });
      if (key) {
        // Invalidate Redis cache if available
        if (this.redisService.isConnected) {
          try {
            await this.redisService.getClient()?.del(`gw:key:${key.hashedSecret}`);
          } catch (e: any) {
            this.logger.warn(`Failed to invalidate key cache: ${e.message}`);
          }
        }
        await this.prisma.gatewayApiKey.delete({ where: { id } });
      }
    }
    return { success: true };
  }
}
