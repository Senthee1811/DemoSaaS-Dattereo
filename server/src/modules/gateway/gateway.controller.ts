import { 
  Controller, 
  Post, 
  Body, 
  Headers, 
  Req, 
  Res, 
  HttpStatus, 
  HttpException 
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { GatewayService } from './gateway.service';
import { PrismaService } from '@/prisma/prisma.service';
import { EncryptionService } from '@/modules/encryption/encryption.service';
import { PricingService } from '@/modules/pricing/pricing.service';
import { RedisService } from '@/modules/redis/redis.service';
import { ChatMessage } from './adapters/provider.adapter.interface';

export class ChatCompletionDto {
  model: string;
  messages: ChatMessage[];
  projectId?: string;
  project_id?: string;
  temperature?: number;
  max_tokens?: number;
  maxTokens?: number;
  stream?: boolean;
  user_id?: string;
  userId?: string;
}

@ApiTags('Unified AI Gateway Proxy')
@Controller(['v1/chat', 'api/v1/chat'])
export class GatewayController {
  constructor(
    private readonly gatewayService: GatewayService,
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly pricingService: PricingService,
    private readonly redisService: RedisService,
  ) {}

  @Post('completions')
  @ApiOperation({ summary: 'OpenAI-Compatible Chat Completion with Spend Governance & Fail-Closed Guardrails' })
  @ApiResponse({ status: 200, description: 'Inference successful within budget' })
  @ApiResponse({ status: 429, description: 'Hard-block budget threshold exceeded (fail-closed)' })
  @ApiResponse({ status: 503, description: 'Governance engine unavailable (fail-closed)' })
  async createChatCompletion(
    @Body() body: ChatCompletionDto,
    @Headers('authorization') authHeader: string,
    @Headers('x-spendguard-key') spendguardKeyHeader: string,
    @Headers('x-spendguard-project-id') projectHeader: string,
    @Headers('x-project-id') altProjectHeader: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!body.model || !body.messages || !Array.isArray(body.messages)) {
      throw new HttpException(
        { error: { message: 'Missing required parameters: model and messages array.', type: 'invalid_request_error' } },
        HttpStatus.BAD_REQUEST,
      );
    }

    let resolvedProjectId = body.projectId || body.project_id || projectHeader || altProjectHeader;
    const rawKey = spendguardKeyHeader || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null);

    // FR-10: SpendGuard Virtual Key Validation & Guardrails
    if (rawKey) {
      const hashedSecret = this.encryptionService.hashToken(rawKey);

      const gwKey = await this.prisma.gatewayApiKey.findUnique({
        where: { hashedSecret },
      });

      if (gwKey) {
        if (!gwKey.isActive) {
          throw new HttpException(
            { error: { message: 'SpendGuard Gateway API key has been revoked.', type: 'authentication_error' } },
            HttpStatus.UNAUTHORIZED,
          );
        }

        // Check Key Expiry
        if (gwKey.expiresAt && new Date() > gwKey.expiresAt) {
          throw new HttpException(
            { error: { message: 'SpendGuard Gateway API key has expired.', type: 'authentication_error' } },
            HttpStatus.UNAUTHORIZED,
          );
        }

        // Check Model Allowlist
        if (gwKey.allowedModels) {
          try {
            const allowed: string[] = JSON.parse(gwKey.allowedModels);
            if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(body.model)) {
              throw new HttpException(
                { error: { message: `Model '${body.model}' is not permitted by this SpendGuard key's guardrail policy.`, type: 'permission_denied' } },
                HttpStatus.FORBIDDEN,
              );
            }
          } catch (e: any) {
            if (e instanceof HttpException) throw e;
          }
        }

        // Check Provider Allowlist
        const provider = this.pricingService.resolveProvider(body.model);
        if (gwKey.allowedProviders) {
          try {
            const allowed: string[] = JSON.parse(gwKey.allowedProviders);
            if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(provider)) {
              throw new HttpException(
                { error: { message: `Provider '${provider}' is not permitted by this SpendGuard key's guardrail policy.`, type: 'permission_denied' } },
                HttpStatus.FORBIDDEN,
              );
            }
          } catch (e: any) {
            if (e instanceof HttpException) throw e;
          }
        }

        // Rate Limiting (Sliding RPM counter in Redis if available)
        if (this.redisService.isConnected && gwKey.rateLimitRpm) {
          const client = this.redisService.getClient();
          if (client) {
            const currentMinute = Math.floor(Date.now() / 60000);
            const rateKey = `gw:rpm:${gwKey.id}:${currentMinute}`;
            const reqCount = await client.incr(rateKey);
            if (reqCount === 1) {
              await client.expire(rateKey, 120);
            }
            if (reqCount > gwKey.rateLimitRpm) {
              throw new HttpException(
                { error: { message: `SpendGuard Key Rate limit exceeded: ${gwKey.rateLimitRpm} RPM cap.`, type: 'rate_limit_exceeded' } },
                HttpStatus.TOO_MANY_REQUESTS,
              );
            }
          }
        }

        resolvedProjectId = gwKey.projectId;

        // Update key usage timestamp asynchronously
        this.prisma.gatewayApiKey.update({
          where: { id: gwKey.id },
          data: { lastUsedAt: new Date() },
        }).catch(() => {});
      }
    }

    // Default to first active project if no project specified
    if (!resolvedProjectId) {
      const firstProject = await this.prisma.project.findFirst({
        where: { isBlocked: false },
      });
      resolvedProjectId = firstProject ? firstProject.id : 'proj_copilot';
    }

    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    const clientSdk = (req.headers['user-agent'] as string) || 'spendguard-sdk';

    const result = await this.gatewayService.processChatCompletion({
      projectId: resolvedProjectId,
      userId: body.userId || body.user_id,
      model: body.model,
      messages: body.messages,
      temperature: body.temperature,
      maxTokens: body.maxTokens || body.max_tokens,
      stream: body.stream,
      clientIp,
      clientSdk,
    });

    // Attach custom telemetry headers
    for (const [k, v] of Object.entries(result.headers)) {
      res.setHeader(k, v);
    }

    return res.status(HttpStatus.OK).json(result);
  }
}
