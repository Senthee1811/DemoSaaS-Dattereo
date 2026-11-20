export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GatewayChatRequest {
  projectId: string;
  userId?: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  clientIp?: string;
  clientSdk?: string;
  /** Present when the request authenticated with a gateway key: that key's own limits. */
  gatewayKey?: {
    id: string;
    budgetMonthly: number | null;
    rateLimitTpm: number | null;
  };
}

export interface AdapterExecutionResult {
  responseText: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  isSimulated: boolean;
}

export interface ProviderAdapter {
  execute(
    req: GatewayChatRequest,
    decryptedApiKey?: string
  ): Promise<AdapterExecutionResult>;
}
