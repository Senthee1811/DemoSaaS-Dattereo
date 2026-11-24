import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  Res,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { GatewayService } from './gateway.service';
import { PrismaService } from '@/prisma/prisma.service';
import { EncryptionService } from '@/modules/encryption/encryption.service';
import { PricingService, modelNotPricedError } from '@/modules/pricing/pricing.service';
import { RedisService } from '@/modules/redis/redis.service';
import { AuthService } from '@/modules/auth/auth.service';
import { Public } from '@/modules/auth/decorators/public.decorator';
import { ChatMessage, GatewayChatRequest } from './adapters/provider.adapter.interface';
import { resolveAttribution } from './attribution';

// An interface (not a class) on purpose: the global ValidationPipe runs with
// `whitelist: true`, which strips every property of an undecorated DTO class.
// That silently emptied every gateway request body. The payload is validated
// explicitly in the handler instead (OpenAI-compatible, many optional fields).
export interface ChatCompletionDto {
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

const MAX_OUTPUT_TOKENS = 32000;

function authError(message: string, code = 'invalid_api_key'): HttpException {
  return new HttpException(
    { error: { message, type: 'authentication_error', code } },
    HttpStatus.UNAUTHORIZED,
  );
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Application name recorded for requests authenticated with a dashboard session instead of a gateway key. */
export const PLAYGROUND_APPLICATION = 'dashboard-playground';

/**
 * Authentication for the gateway is handled here (not by the global JWT guard)
 * because it accepts two credential types:
 *   1. SpendGuard gateway keys (sg_live_* / sg_test_*) — the key decides the project.
 *   2. A dashboard user session (JWT) — the requested project must belong to the user's org.
 * A bare project header is NEVER sufficient.
 */
@ApiTags('Unified AI Gateway Proxy')
@ApiBearerAuth()
@Public()
@Controller(['v1/chat', 'api/v1/chat'])
export class GatewayController {
  constructor(
    private readonly gatewayService: GatewayService,
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly pricingService: PricingService,
    private readonly redisService: RedisService,
    private readonly authService: AuthService,
  ) {}

  @Post('completions')
  @ApiOperation({ summary: 'OpenAI-Compatible Chat Completion with Spend Governance & Fail-Closed Guardrails' })
  @ApiResponse({ status: 200, description: 'Inference successful within budget' })
  @ApiResponse({ status: 401, description: 'Missing or invalid credentials' })
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
    if (
      !body?.model ||
      typeof body.model !== 'string' ||
      !Array.isArray(body.messages) ||
      body.messages.length === 0 ||
      body.messages.some((m) => !m || typeof m.content !== 'string' || typeof m.role !== 'string')
    ) {
      throw new HttpException(
        { error: { message: 'Missing required parameters: model and a non-empty messages array of {role, content}.', type: 'invalid_request_error' } },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (body.stream) {
      throw new HttpException(
        { error: { message: 'Streaming responses are not supported yet. Omit "stream" or set it to false.', type: 'invalid_request_error', code: 'stream_unsupported' } },
        HttpStatus.BAD_REQUEST,
      );
    }

    const requestedMax = Number(body.maxTokens ?? body.max_tokens ?? 1000);
    const maxTokens = Number.isFinite(requestedMax) ? Math.min(Math.max(Math.floor(requestedMax), 1), MAX_OUTPUT_TOKENS) : 1000;

    const bearer = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const rawKey = (spendguardKeyHeader || bearer || '').trim();

    if (!rawKey) {
      throw authError(
        'Missing authentication. Provide a SpendGuard API key via "Authorization: Bearer sg_live_..."',
        'missing_credentials',
      );
    }

    let resolvedProjectId: string;
    let resolvedOrgId: string | undefined;
    let actingUserId: string | undefined;
    let gatewayKeyLimits: GatewayChatRequest['gatewayKey'];
    let keyAssignment: { application: string | null; team: string | null } = { application: null, team: null };
    let sessionDefaultApplication: string | null = null;

    if (rawKey.startsWith('sg_')) {
      // ---- 1. SpendGuard virtual gateway key ----
      const gwKey = await this.prisma.gatewayApiKey.findUnique({
        where: { hashedSecret: this.encryptionService.hashToken(rawKey) },
        // The owning org travels with the request so failed-call audit rows need no extra lookup
        include: { project: { select: { orgId: true } } },
      });

      if (!gwKey) throw authError('Invalid SpendGuard Gateway API key.');
      if (!gwKey.isActive) throw authError('SpendGuard Gateway API key has been revoked.');
      if (gwKey.expiresAt && new Date() > gwKey.expiresAt) {
        throw authError('SpendGuard Gateway API key has expired.');
      }

      const allowedModels = parseJsonArray(gwKey.allowedModels);
      if (allowedModels.length > 0 && !allowedModels.includes(body.model)) {
        throw new HttpException(
          { error: { message: `Model '${body.model}' is not permitted by this SpendGuard key's guardrail policy.`, type: 'permission_denied' } },
          HttpStatus.FORBIDDEN,
        );
      }

      const provider = this.pricingService.resolveProvider(body.model);
      const allowedProviders = parseJsonArray(gwKey.allowedProviders);
      if (allowedProviders.length > 0 && !allowedProviders.includes(provider)) {
        throw new HttpException(
          { error: { message: `Provider '${provider}' is not permitted by this SpendGuard key's guardrail policy.`, type: 'permission_denied' } },
          HttpStatus.FORBIDDEN,
        );
      }

      // Per-key RPM limit (fixed one-minute window in Redis)
      const client = this.redisService.getClient();
      if (client && gwKey.rateLimitRpm) {
        const rateKey = `gw:rpm:${gwKey.id}:${Math.floor(Date.now() / 60000)}`;
        const reqCount = await client.incr(rateKey);
        if (reqCount === 1) await client.expire(rateKey, 120);
        if (reqCount > gwKey.rateLimitRpm) {
          throw new HttpException(
            { error: { message: `SpendGuard Key Rate limit exceeded: ${gwKey.rateLimitRpm} RPM cap.`, type: 'rate_limit_exceeded' } },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }

      // The key — not any client-supplied header/body field — decides the project
      resolvedProjectId = gwKey.projectId;
      resolvedOrgId = (gwKey as any).project?.orgId;
      keyAssignment = { application: (gwKey as any).application ?? null, team: (gwKey as any).team ?? null };
      gatewayKeyLimits = {
        id: gwKey.id,
        budgetMonthly: gwKey.budgetMonthly != null ? Number(gwKey.budgetMonthly) : null,
        rateLimitTpm: gwKey.rateLimitTpm ?? null,
      };

      this.prisma.gatewayApiKey
        .update({ where: { id: gwKey.id }, data: { lastUsedAt: new Date() } })
        .catch(() => {});
    } else {
      // ---- 2. Dashboard user session (e.g. the Playground) ----
      const user = await this.authService.verifyAccessToken(rawKey);
      if (!user) throw authError('Invalid or expired credentials.');

      const requestedProjectId = body.projectId || body.project_id || projectHeader || altProjectHeader;
      if (!requestedProjectId) {
        throw new HttpException(
          { error: { message: 'projectId is required when calling the gateway with a dashboard session.', type: 'invalid_request_error', code: 'project_required' } },
          HttpStatus.BAD_REQUEST,
        );
      }

      const project = await this.prisma.project.findFirst({
        where: { id: requestedProjectId, orgId: user.orgId },
        select: { id: true },
      });
      if (!project) {
        throw new HttpException(
          { error: { message: `Project '${requestedProjectId}' was not found.`, type: 'invalid_request_error', code: 'project_not_found' } },
          HttpStatus.NOT_FOUND,
        );
      }

      resolvedProjectId = project.id;
      resolvedOrgId = user.orgId;
      actingUserId = user.id;
      // Dashboard-session traffic (the Playground) is attributed by SERVER policy, not by anything the browser claims.
      // The user has no key assignment, so without this their test spend would be indistinguishable from real traffic.
      sessionDefaultApplication = PLAYGROUND_APPLICATION;
    }

    // Reject unpriced models before any budget hold or upstream call: an unknown
    // model must never be billed at some other model's rate.
    if (!this.pricingService.isModelPriced(body.model)) {
      throw modelNotPricedError(body.model);
    }

    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const clientSdk = (req.headers['user-agent'] as string) || 'spendguard-sdk';

    // Attribution: the key's assignment is authoritative; headers only fill what the key leaves unset
    const attribution = resolveAttribution({
      keyApplication: keyAssignment.application,
      keyTeam: keyAssignment.team,
      headerApplication: req.headers['x-spendguard-application'],
      headerTeam: req.headers['x-spendguard-team'],
      headerTags: req.headers['x-spendguard-tags'],
      sessionDefaultApplication,
    });

    const result = await this.gatewayService.processChatCompletion({
      projectId: resolvedProjectId,
      orgId: resolvedOrgId,
      // userId is only trusted from an authenticated session, never from the body
      userId: actingUserId,
      model: body.model,
      messages: body.messages,
      temperature: body.temperature,
      maxTokens,
      stream: false,
      clientIp,
      clientSdk,
      gatewayKey: gatewayKeyLimits,
      attribution,
    });
    if (attribution.ignored.length) res.setHeader('X-SpendGuard-Attribution-Ignored', attribution.ignored.join('; ').slice(0, 500));

    const { headers, ...payload } = result;
    for (const [k, v] of Object.entries(headers)) {
      res.setHeader(k, v);
    }

    return res.status(HttpStatus.OK).json(payload);
  }
}
