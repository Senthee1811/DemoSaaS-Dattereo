export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GatewayChatRequest {
  projectId: string;
  /** Organization that owns the project (for audit rows). Resolved from the project when absent. */
  orgId?: string;
  userId?: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  clientIp?: string;
  clientSdk?: string;
  /** Spend attribution resolved by the controller (key-assigned values win over client headers). */
  attribution?: {
    application: string | null;
    team: string | null;
    tags: Record<string, string> | null;
    sources: { application: 'key' | 'header' | 'session' | null; team: 'key' | 'header' | 'session' | null };
  };
  /** Present when the request authenticated with a gateway key: that key's own limits. */
  gatewayKey?: {
    id: string;
    budgetMonthly: number | null;
    rateLimitTpm: number | null;
  };
}

/**
 * Normalised usage. Provider-specific shapes are converted here so pricing sees one meaning:
 *  - promptTokens     = ALL input tokens, including cached reads and cache writes
 *  - completionTokens = ALL billed output tokens, including reasoning/thinking tokens
 */
export interface AdapterExecutionResult {
  responseText: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  isSimulated: boolean;
  /** Of promptTokens: tokens read from the provider's prompt cache (billed at the cached rate). */
  cachedPromptTokens?: number;
  /** Of promptTokens: tokens written to Anthropic's cache (5-minute / 1-hour TTL). */
  cacheWriteTokens?: { fiveMinute: number; oneHour: number };
  /** Of completionTokens: reasoning/thinking tokens (informational; already inside completionTokens). */
  reasoningTokens?: number;
  /** True when the provider returned no usage block and token counts are SpendGuard estimates. */
  usageEstimated?: boolean;
  /** Stop reason in the OpenAI vocabulary (stop | length | tool_calls | content_filter). */
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  /** The provider's own stop reason, verbatim. */
  providerFinishReason?: string | null;
}

export interface ProviderAdapter {
  execute(
    req: GatewayChatRequest,
    decryptedApiKey?: string
  ): Promise<AdapterExecutionResult>;
}
