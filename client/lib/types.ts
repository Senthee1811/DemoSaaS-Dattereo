export type UserRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type Provider = 'OPENAI' | 'GEMINI' | 'CLAUDE';
export type ThresholdType = 'PERCENT_50' | 'PERCENT_80' | 'PERCENT_90' | 'HARD_BLOCK' | 'ANOMALY_DETECTED';
export type AlertChannel = 'IN_APP' | 'SLACK' | 'EMAIL' | 'WEBHOOK';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  currency: string;
  createdAt: string;
}

export interface User {
  id: string;
  orgId: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  createdAt: string;
}

export interface Project {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  description?: string;
  budgetMonthly: number;
  budgetWeekly: number;
  budgetHardBlockEnabled: boolean;
  isBlocked: boolean;
  blockReason?: string;
  currentMonthlySpend: number;
  currentWeeklySpend: number;
  createdAt: string;
}

export interface ProviderApiKey {
  id: string;
  projectId: string;
  provider: Provider;
  keyName: string;
  keyPrefix: string;
  encryptedKey: string;
  isActive: boolean;
  lastUsedAt?: string;
  createdAt: string;
}

export interface GatewayApiKey {
  id: string;
  projectId: string;
  keyName: string;
  keyPrefix: string;
  hashedSecret: string;
  rateLimitRpm: number;
  isActive: boolean;
  lastUsedAt?: string;
  createdAt: string;
}

export interface RequestLog {
  id: string;
  projectId: string;
  projectName?: string;
  userId: string;
  userName?: string;
  provider: Provider;
  model: string;
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  costEstimate: number;
  latencyMs: number;
  statusCode: number;
  isAnomaly: boolean;
  anomalyReason?: string;
  isBlocked: boolean;
  promptPreview?: string;
  responsePreview?: string;
  metadataJson?: string;
  timestamp: string;
}

export interface BudgetAlert {
  id: string;
  projectId: string;
  projectName?: string;
  thresholdType: ThresholdType;
  thresholdValue: number;
  triggeredAt: string;
  channel: AlertChannel;
  title: string;
  message: string;
  isRead: boolean;
  status: 'PENDING' | 'SENT' | 'DISMISSED';
}

export interface AlertConfig {
  id: string;
  projectId: string;
  slackWebhookUrl?: string;
  emailRecipients?: string[];
  warningThresholdPct: number;
  hardBlockPct: number;
  notifyOnAnomaly: boolean;
}

export interface AuditLogEntry {
  id: string;
  orgId: string;
  projectId?: string;
  projectName?: string;
  actorName: string;
  actorEmail: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadataJson?: string;
  createdAt: string;
}

export interface ModelPricing {
  provider: Provider;
  model: string;
  displayName: string;
  inputPer1k: number;
  outputPer1k: number;
  contextWindow: number;
}
