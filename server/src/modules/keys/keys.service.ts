import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { EncryptionService } from '@/modules/encryption/encryption.service';

export interface StoreProviderKeyDto {
  projectId: string;
  provider: 'OPENAI' | 'ANTHROPIC' | 'GEMINI';
  keyName: string;
  plainKey: string;
}

export interface GenerateGatewayKeyDto {
  projectId: string;
  keyName: string;
  rateLimitRpm?: number;
}

@Injectable()
export class KeysService {
  private readonly logger = new Logger(KeysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
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
        rateLimitRpm: gk.rateLimitRpm,
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

    const key = await this.prisma.providerApiKey.create({
      data: {
        projectId: dto.projectId,
        provider: dto.provider,
        keyName: dto.keyName,
        keyPrefix,
        encryptedKey,
        isActive: true,
      },
    });

    return {
      id: key.id,
      projectId: key.projectId,
      provider: key.provider,
      keyName: key.keyName,
      keyPrefix: key.keyPrefix,
      createdAt: key.createdAt,
    };
  }

  async generateGatewayKey(dto: GenerateGatewayKeyDto) {
    if (!dto.keyName || !dto.projectId) {
      throw new BadRequestException('Missing required key parameters');
    }

    const { secret, keyPrefix, hashedSecret } = this.encryptionService.generateGatewaySecret();

    const key = await this.prisma.gatewayApiKey.create({
      data: {
        projectId: dto.projectId,
        keyName: dto.keyName,
        keyPrefix,
        hashedSecret,
        rateLimitRpm: dto.rateLimitRpm || 1200,
        isActive: true,
      },
    });

    return {
      id: key.id,
      projectId: key.projectId,
      keyName: key.keyName,
      keyPrefix: key.keyPrefix,
      secret, // Returned ONLY once upon creation
      createdAt: key.createdAt,
    };
  }

  async revokeKey(id: string, type: 'PROVIDER' | 'GATEWAY') {
    if (type === 'PROVIDER') {
      await this.prisma.providerApiKey.delete({ where: { id } });
    } else {
      await this.prisma.gatewayApiKey.delete({ where: { id } });
    }
    return { success: true };
  }
}
