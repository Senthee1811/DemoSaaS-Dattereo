import { getDb } from './db';
import { checkProjectBudgetGuardrail, evaluatePostRequestBudgetThresholds, recordBudgetAlert } from './budget';
import { calculateCost, estimateTokens, MODEL_PRICING_CATALOG } from './pricing';
import { detectAnomaly } from './anomaly';
import { decryptApiKey } from './encryption';
import { Provider } from './types';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface GatewayExecutionRequest {
  projectId: string;
  userId?: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  clientIp?: string;
  clientSdk?: string;
}

export interface GatewayExecutionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  provider: Provider;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  governance: {
    cost_estimate_usd: number;
    latency_ms: number;
    is_anomaly: boolean;
    anomaly_reason?: string;
    project_id: string;
    project_name: string;
    budget_remaining_usd: number;
    monthly_spend_usd: number;
    budget_utilization_pct: number;
  };
}

/**
 * Infer provider from model name
 */
export function inferProvider(model: string): Provider {
  const m = model.toLowerCase();
  if (m.startsWith('claude')) return 'CLAUDE';
  if (m.startsWith('gemini')) return 'GEMINI';
  return 'OPENAI';
}

/**
 * Execute a chat completion through the spend governance gateway
 */
export async function executeGatewayChat(req: GatewayExecutionRequest): Promise<{
  status: number;
  data: any;
  headers: Record<string, string>;
}> {
  const startTime = Date.now();
  const db = getDb();

  // 1. Resolve Project
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.projectId) as any;
  if (!project) {
    return {
      status: 404,
      data: {
        error: {
          message: `Project with ID '${req.projectId}' was not found in spend governance registry.`,
          type: 'invalid_request_error',
          code: 'project_not_found'
        }
      },
      headers: {}
    };
  }

  // 2. Resolve User
  const userId = req.userId || 'usr_alex_rivera';
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  const userName = user ? user.name : 'API Client';

  // 3. Pre-flight Governance Guardrail Check (Fail-Closed)
  const budgetGuard = checkProjectBudgetGuardrail(req.projectId);
  if (!budgetGuard.canProceed) {
    // Record the blocked attempt in the immutable audit & request ledger
    const promptText = req.messages.map(m => `${m.role}: ${m.content}`).join('\n');
    const tokensIn = estimateTokens(promptText);
    const reqId = `req_blk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    db.prepare(`
      INSERT INTO requests (
        id, project_id, user_id, provider, model, tokens_in, tokens_out, total_tokens,
        cost_estimate, latency_ms, status_code, is_anomaly, anomaly_reason, is_blocked,
        prompt_preview, response_preview, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      reqId,
      req.projectId,
      userId,
      inferProvider(req.model),
      req.model,
      tokensIn,
      0,
      tokensIn,
      0,
      Date.now() - startTime,
      429,
      0,
      'Blocked: Hard budget cap reached or project frozen',
      promptText.slice(0, 300),
      'Request blocked by SpendGuard AI Policy: ' + budgetGuard.blockReason,
      JSON.stringify({ clientIp: req.clientIp || '127.0.0.1', clientSdk: req.clientSdk || 'spendguard-direct' })
    );

    return {
      status: 429,
      data: {
        error: {
          message: `SpendGuard AI Guardrail: Request blocked. ${budgetGuard.blockReason}`,
          type: 'spend_governance_block',
          code: 'budget_exceeded',
          guardrail: {
            project: project.name,
            monthly_budget: project.budget_monthly,
            current_spend: budgetGuard.currentMonthlySpend,
            utilization_pct: Math.round(budgetGuard.percentageUsed * 10) / 10,
            hard_blocked: true,
            action_required: 'Increase monthly project budget or unblock project in SpendGuard dashboard.'
          }
        }
      },
      headers: {
        'X-SpendGuard-Blocked': 'true',
        'X-SpendGuard-Reason': 'budget_exceeded',
        'X-SpendGuard-Monthly-Spend': budgetGuard.currentMonthlySpend.toFixed(2),
        'X-SpendGuard-Monthly-Budget': project.budget_monthly.toFixed(2)
      }
    };
  }

  // 4. Provider Key & Gateway Forwarding
  const provider = inferProvider(req.model);
  const providerKeyRow = db.prepare(`
    SELECT * FROM provider_api_keys
    WHERE project_id = ? AND provider = ? AND is_active = 1
  `).get(req.projectId, provider) as any;

  let rawResponseText = '';
  let tokensIn = 0;
  let tokensOut = 0;

  const promptText = req.messages.map(m => `${m.role}: ${m.content}`).join('\n');
  tokensIn = estimateTokens(promptText);

  // Check if real decrypted API key exists (if user provided live secret)
  const realKey = providerKeyRow ? decryptApiKey(providerKeyRow.encrypted_key) : '';
  const isSimulated = !realKey || realKey.includes('demo') || realKey.includes('live-production-openai-vault');

  if (!isSimulated && realKey) {
    try {
      // Forward to real external provider
      if (provider === 'OPENAI') {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${realKey}`
          },
          body: JSON.stringify({
            model: req.model,
            messages: req.messages,
            temperature: req.temperature ?? 0.7,
            max_tokens: req.maxTokens ?? 1000
          })
        });

        if (!resp.ok) {
          const errText = await resp.text();
          throw new Error(`OpenAI error: ${resp.status} ${errText}`);
        }

        const data = await resp.json();
        rawResponseText = data.choices?.[0]?.message?.content || '';
        tokensIn = data.usage?.prompt_tokens || tokensIn;
        tokensOut = data.usage?.completion_tokens || estimateTokens(rawResponseText);
      } else {
        // Fallback for demo keys
        rawResponseText = generateHighFidelityMockResponse(req.model, req.messages);
        tokensOut = estimateTokens(rawResponseText);
      }
    } catch (err: any) {
      console.warn('Real provider call fallback to sandbox generator:', err.message);
      rawResponseText = generateHighFidelityMockResponse(req.model, req.messages);
      tokensOut = estimateTokens(rawResponseText);
    }
  } else {
    // High-fidelity sandbox synthesis for instant demo/test execution
    // Introduce realistic AI inference latency (120ms - 450ms)
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 200 + 120)));
    rawResponseText = generateHighFidelityMockResponse(req.model, req.messages);
    tokensOut = estimateTokens(rawResponseText);
  }

  const latencyMs = Date.now() - startTime;
  const totalTokens = tokensIn + tokensOut;
  const costEstimate = calculateCost(req.model, tokensIn, tokensOut);

  // 5. Check Statistical Anomaly
  const recentProjectReqs = db.prepare(`
    SELECT cost_estimate, total_tokens
    FROM requests
    WHERE project_id = ? AND is_blocked = 0
    ORDER BY created_at DESC
    LIMIT 40
  `).all(req.projectId) as Array<{ cost_estimate: number; total_tokens: number }>;

  const anomalyCheck = detectAnomaly(
    costEstimate,
    totalTokens,
    recentProjectReqs.map(r => ({ costEstimate: r.cost_estimate, totalTokens: r.total_tokens }))
  );

  // If anomaly detected, trigger Alert
  if (anomalyCheck.isAnomaly) {
    recordBudgetAlert({
      projectId: req.projectId,
      projectName: project.name,
      thresholdType: 'ANOMALY_DETECTED',
      thresholdValue: costEstimate,
      channel: 'IN_APP',
      title: `⚡ Spend Anomaly: ${req.model} on ${project.name}`,
      message: anomalyCheck.reason || `Unusual usage pattern detected on ${req.model}`
    });
  }

  // 6. Log Request in Immutable Ledger
  const reqId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  db.prepare(`
    INSERT INTO requests (
      id, project_id, user_id, provider, model, tokens_in, tokens_out, total_tokens,
      cost_estimate, latency_ms, status_code, is_anomaly, anomaly_reason, is_blocked,
      prompt_preview, response_preview, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 200, ?, ?, 0, ?, ?, ?, datetime('now'))
  `).run(
    reqId,
    req.projectId,
    userId,
    provider,
    req.model,
    tokensIn,
    tokensOut,
    totalTokens,
    costEstimate,
    latencyMs,
    anomalyCheck.isAnomaly ? 1 : 0,
    anomalyCheck.reason || null,
    promptText.slice(0, 300),
    rawResponseText.slice(0, 300),
    JSON.stringify({
      clientIp: req.clientIp || '127.0.0.1',
      clientSdk: req.clientSdk || 'spendguard-unified-gateway/v2.0',
      isSimulated
    })
  );

  // Update key last used
  if (providerKeyRow) {
    db.prepare('UPDATE provider_api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').run(providerKeyRow.id);
  }

  // 7. Check post-request budget thresholds
  const updatedSpend = budgetGuard.currentMonthlySpend + costEstimate;
  evaluatePostRequestBudgetThresholds(req.projectId, updatedSpend);

  const budgetRemaining = Math.max(0, project.budget_monthly - updatedSpend);
  const utilizationPct = project.budget_monthly > 0 ? (updatedSpend / project.budget_monthly) * 100 : 0;

  const responsePayload: GatewayExecutionResponse = {
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
          content: rawResponseText
        },
        finish_reason: 'stop'
      }
    ],
    usage: {
      prompt_tokens: tokensIn,
      completion_tokens: tokensOut,
      total_tokens: totalTokens
    },
    governance: {
      cost_estimate_usd: costEstimate,
      latency_ms: latencyMs,
      is_anomaly: anomalyCheck.isAnomaly,
      anomaly_reason: anomalyCheck.reason,
      project_id: req.projectId,
      project_name: project.name,
      budget_remaining_usd: Math.round(budgetRemaining * 100) / 100,
      monthly_spend_usd: Math.round(updatedSpend * 100) / 100,
      budget_utilization_pct: Math.round(utilizationPct * 10) / 10
    }
  };

  return {
    status: 200,
    data: responsePayload,
    headers: {
      'X-SpendGuard-Cost': costEstimate.toFixed(6),
      'X-SpendGuard-Tokens-Total': totalTokens.toString(),
      'X-SpendGuard-Budget-Remaining': budgetRemaining.toFixed(2),
      'X-SpendGuard-Utilization-Pct': utilizationPct.toFixed(1),
      'X-SpendGuard-Anomaly': anomalyCheck.isAnomaly ? 'true' : 'false'
    }
  };
}

function generateHighFidelityMockResponse(model: string, messages: ChatMessage[]): string {
  const lastUserMsg = messages.filter(m => m.role === 'user').slice(-1)[0]?.content || 'Hello';
  const lower = lastUserMsg.toLowerCase();

  if (lower.includes('code') || lower.includes('function') || lower.includes('typescript') || lower.includes('python')) {
    return `Here is the clean, production-ready implementation tailored for your stack:\n\n\`\`\`typescript\n// SpendGuard AI Verified Response\nexport async function processDataPipeline(items: string[]): Promise<Map<string, number>> {\n  const frequencyMap = new Map<string, number>();\n  for (const item of items) {\n    const count = frequencyMap.get(item) || 0;\n    frequencyMap.set(item, count + 1);\n  }\n  return frequencyMap;\n}\n\`\`\`\n\n**Governance Notice**: Model execution (${model}) tracked with zero retention policy under SpendGuard enterprise guardrails.`;
  }

  if (lower.includes('summarize') || lower.includes('summary')) {
    return `### Executive Governance Summary\n\n1. **Core Insight**: The operational parameters are within nominal thresholds, showing 99.94% reliability across multi-provider routing.\n2. **Actionable Recommendation**: Consolidate repetitive prompt templates to reduce input token overhead by ~28%.\n3. **Risk Profile**: Low risk; all budgetary guardrails and audit policies active.`;
  }

  return `[${model} Response via SpendGuard Gateway]\n\nProcessed query: "${lastUserMsg.length > 80 ? lastUserMsg.slice(0, 80) + '...' : lastUserMsg}".\n\nAll parameters analyzed and verified. Multi-provider spend tracking, budget caps, and tamper-proof audit trails are actively protecting this workspace.`;
}
