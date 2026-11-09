import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/modules/redis/redis.service';
import { BudgetService } from '@/modules/budget/budget.service';
import { PricingService } from '@/modules/pricing/pricing.service';
import { AnomalyService } from '@/modules/anomaly/anomaly.service';
import { EncryptionService } from '@/modules/encryption/encryption.service';
import { OpenAIAdapter } from './adapters/openai.adapter';
import { AnthropicAdapter } from './adapters/anthropic.adapter';
import { GeminiAdapter } from './adapters/gemini.adapter';
import { GatewayChatRequest } from './adapters/provider.adapter.interface';

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly budgetService: BudgetService,
    private readonly pricingService: PricingService,
    private readonly anomalyService: AnomalyService,
    private readonly encryptionService: EncryptionService,
    private readonly openAIAdapter: OpenAIAdapter,
    private readonly anthropicAdapter: AnthropicAdapter,
    private readonly geminiAdapter: GeminiAdapter,
  ) {}

  async processChatCompletion(req: GatewayChatRequest) {
    const startTime = Date.now();
    const provider = this.pricingService.resolveProvider(req.model);

    // 1. Pre-Flight Fail-Closed Budget Guardrail Check (uses Redis-cached spend)
    const budgetGuard = await this.budgetService.checkBudgetGuardrail(req.projectId);

    if (!budgetGuard.canProceed) {
      const blockedReqId = `req_blk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      
      // Log blocked attempt into audit ledger (async — don't block response)
      this.logBlockedRequest(blockedReqId, req, provider, budgetGuard).catch(err =>
        this.logger.warn(`Could not log blocked request: ${err.message}`),
      );

      // Distinguish governance_unavailable (infra failure) from budget_exceeded (policy enforcement)
      const isGovernanceUnavailable = budgetGuard.blockReason?.includes('Governance engine unavailable');
      const errorCode = isGovernanceUnavailable ? 'governance_unavailable' : 'budget_exceeded';
      const httpStatus = isGovernanceUnavailable
        ? HttpStatus.SERVICE_UNAVAILABLE   // 503 for infra failure
        : HttpStatus.TOO_MANY_REQUESTS;    // 429 for budget exceeded

      throw new HttpException(
        {
          error: {
            message: `SpendGuard AI Guardrail: Request blocked. ${budgetGuard.blockReason}`,
            type: errorCode,
            code: errorCode,
            project_id: req.projectId,
            budget_monthly: budgetGuard.budgetMonthly,
            current_spend: budgetGuard.currentMonthlySpend,
          },
        },
        httpStatus,
      );
    }

    // 2. Fetch scoped provider API key from encrypted vault
    let decryptedKey: string | undefined;
    try {
      const providerKeyRow = await this.prisma.providerApiKey.findFirst({
        where: {
          projectId: req.projectId,
          provider,
          isActive: true,
        },
      });

      if (providerKeyRow) {
        decryptedKey = this.encryptionService.decryptApiKey(providerKeyRow.encryptedKey);
        
        // Update last used timestamp (async)
        this.prisma.providerApiKey.update({
          where: { id: providerKeyRow.id },
          data: { lastUsedAt: new Date() },
        }).catch(() => {});
      }
    } catch (err: any) {
      this.logger.warn(`Key lookup warning: ${err.message}`);
    }

    // 3. Dispatch to Provider Adapter
    let adapterResult;
    if (provider === 'ANTHROPIC') {
      adapterResult = await this.anthropicAdapter.execute(req, decryptedKey);
    } else if (provider === 'GEMINI') {
      adapterResult = await this.geminiAdapter.execute(req, decryptedKey);
    } else {
      adapterResult = await this.openAIAdapter.execute(req, decryptedKey);
    }

    const latencyMs = Date.now() - startTime;
    const costEstimate = this.pricingService.calculateCost(
      req.model,
      adapterResult.promptTokens,
      adapterResult.completionTokens,
    );

    // 4. Anomaly Spike Detection
    const recentRequests = await this.prisma.request.findMany({
      where: { projectId: req.projectId, isBlocked: false },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: { costEstimate: true, totalTokens: true },
    });

    const anomalyResult = this.anomalyService.detectSpike(
      costEstimate,
      adapterResult.totalTokens,
      recentRequests.map(r => ({
        costEstimate: Number(r.costEstimate),
        totalTokens: r.totalTokens,
      })),
    );

    if (anomalyResult.isAnomaly) {
      await this.budgetService.recordAlert({
        projectId: req.projectId,
        thresholdType: 'ANOMALY_DETECTED',
        thresholdValue: costEstimate,
        title: `⚡ Spend Spike Detected: ${req.model}`,
        message: anomalyResult.reason || `Abnormal token volume on ${req.model}`,
      });
    }

    // 5. Append-only Immutable Request Logging (async — don't block response)
    const reqId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const promptText = req.messages.map(m => m.content).join(' ');

    this.logSuccessfulRequest(reqId, req, provider, adapterResult, costEstimate, latencyMs, anomalyResult, promptText)
      .catch(err => this.logger.warn(`Failed to log request: ${err.message}`));

    // 6. Increment Redis spend counter (async)
    this.redisService.incrementProjectSpend(req.projectId, costEstimate)
      .catch(err => this.logger.warn(`Failed to increment Redis spend: ${err.message}`));

    // 7. Post-Request Threshold Check (80% soft warning)
    const updatedSpend = budgetGuard.currentMonthlySpend + costEstimate;
    this.budgetService.evaluatePostRequestThresholds(req.projectId, updatedSpend)
      .catch(err => this.logger.warn(`Post-request threshold check error: ${err.message}`));

    const budgetRemaining = Math.max(0, budgetGuard.budgetMonthly - updatedSpend);

    // 8. OpenAI-Compatible Response Structure
    return {
      id: `chatcmpl-${reqId}`,
      object: 'chat.completion',
      created: Math.floor(startTime / 1000),
      model: req.model,
      provider,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: adapterResult.responseText,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: adapterResult.promptTokens,
        completion_tokens: adapterResult.completionTokens,
        total_tokens: adapterResult.totalTokens,
      },
      governance: {
        cost_estimate_usd: costEstimate,
        latency_ms: latencyMs,
        is_anomaly: anomalyResult.isAnomaly,
        anomaly_reason: anomalyResult.reason,
        project_id: req.projectId,
        budget_remaining_usd: Number(budgetRemaining.toFixed(2)),
        fail_closed_active: true,
      },
      headers: {
        'X-SpendGuard-Cost': costEstimate.toFixed(6),
        'X-SpendGuard-Latency': String(latencyMs),
        'X-SpendGuard-Blocked': 'false',
      },
    };
  }

  private async logBlockedRequest(reqId: string, req: GatewayChatRequest, provider: string, budgetGuard: any) {
    await this.prisma.request.create({
      data: {
        id: reqId,
        projectId: req.projectId,
        userId: req.userId || null,
        provider: provider as any,
        model: req.model,
        tokensIn: this.pricingService.estimateTokens(req.messages.map(m => m.content).join(' ')),
        tokensOut: 0,
        totalTokens: this.pricingService.estimateTokens(req.messages.map(m => m.content).join(' ')),
        costEstimate: 0,
        latencyMs: 0,
        statusCode: 429,
        isAnomaly: false,
        anomalyReason: budgetGuard.blockReason || 'Hard-block limit active',
        isBlocked: true,
        promptPreview: req.messages[0]?.content?.slice(0, 200) || '',
        responsePreview: 'FAIL_CLOSED_GUARDRAIL_BLOCKED',
      },
    });
  }

  private async logSuccessfulRequest(
    reqId: string,
    req: GatewayChatRequest,
    provider: string,
    adapterResult: any,
    costEstimate: number,
    latencyMs: number,
    anomalyResult: any,
    promptText: string,
  ) {
    await this.prisma.request.create({
      data: {
        id: reqId,
        projectId: req.projectId,
        userId: req.userId || null,
        provider: provider as any,
        model: req.model,
        tokensIn: adapterResult.promptTokens,
        tokensOut: adapterResult.completionTokens,
        totalTokens: adapterResult.totalTokens,
        costEstimate,
        latencyMs,
        statusCode: 200,
        isAnomaly: anomalyResult.isAnomaly,
        anomalyReason: anomalyResult.reason || null,
        isBlocked: false,
        promptPreview: promptText.slice(0, 300),
        responsePreview: adapterResult.responseText.slice(0, 300),
        metadataJson: JSON.stringify({
          clientIp: req.clientIp || '127.0.0.1',
          clientSdk: req.clientSdk || 'spendguard-nestjs-gateway/v2.0',
          isSimulated: adapterResult.isSimulated,
        }),
      },
    });
  }
}
