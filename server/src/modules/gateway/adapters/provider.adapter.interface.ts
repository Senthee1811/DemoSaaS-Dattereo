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
