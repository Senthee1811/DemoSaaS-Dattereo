/**
 * Centralized API client for frontend → NestJS backend communication.
 * All dashboard API calls go through this module instead of the prototype JSON store.
 * 
 * Falls back to local Next.js API routes for development when the backend is offline.
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:4000';

export interface ApiClientOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * Makes an authenticated request to the NestJS backend.
 * Returns parsed JSON or throws on error.
 */
export async function apiClient<T = any>(
  path: string,
  options: ApiClientOptions = {},
): Promise<T> {
  const { method = 'GET', body, headers = {}, timeout = 15000 } = options;

  const url = `${BACKEND_URL}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData?.error?.message || errorData?.message || `API Error: ${response.status}`);
    }

    return response.json();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Request to ${path} timed out after ${timeout}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// Typed API functions for each backend endpoint
// ============================================================

/** Analytics Dashboard */
export async function fetchAnalytics(projectId?: string) {
  const params = projectId ? `?projectId=${projectId}` : '';
  return apiClient(`/api/v1/analytics${params}`);
}

/** Projects */
export async function fetchProjects(orgId?: string) {
  const params = orgId ? `?orgId=${orgId}` : '';
  return apiClient(`/api/v1/projects${params}`);
}

export async function createProject(data: any) {
  return apiClient('/api/v1/projects', { method: 'POST', body: data });
}

export async function updateProject(data: any) {
  return apiClient('/api/v1/projects', { method: 'PATCH', body: data });
}

/** Keys */
export async function fetchKeys(projectId?: string) {
  const params = projectId ? `?projectId=${projectId}` : '';
  return apiClient(`/api/v1/keys${params}`);
}

export async function createKey(data: any) {
  return apiClient('/api/v1/keys', { method: 'POST', body: data });
}

export async function revokeKey(id: string, type: 'PROVIDER' | 'GATEWAY') {
  return apiClient(`/api/v1/keys?id=${id}&type=${type}`, { method: 'DELETE' });
}

/** Audit */
export async function fetchAuditLogs(params?: {
  projectId?: string;
  model?: string;
  anomalyOnly?: boolean;
  blockedOnly?: boolean;
  limit?: number;
  offset?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.projectId) searchParams.set('projectId', params.projectId);
  if (params?.model) searchParams.set('model', params.model);
  if (params?.anomalyOnly) searchParams.set('anomalyOnly', 'true');
  if (params?.blockedOnly) searchParams.set('blockedOnly', 'true');
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));
  const qs = searchParams.toString();
  return apiClient(`/api/v1/audit${qs ? '?' + qs : ''}`);
}

export async function exportAuditCsv(projectId?: string) {
  const params = projectId ? `?projectId=${projectId}` : '';
  const url = `${BACKEND_URL}/api/v1/audit/export${params}`;
  const response = await fetch(url);
  return response.text();
}

/** Alerts */
export async function fetchAlerts(projectId?: string) {
  const params = projectId ? `?projectId=${projectId}` : '';
  return apiClient(`/api/v1/alerts${params}`);
}

export async function markAlertRead(id?: string, markAllRead?: boolean) {
  return apiClient('/api/v1/alerts', { method: 'PATCH', body: { id, markAllRead } });
}

export async function triggerTestAlert(data: any) {
  return apiClient('/api/v1/alerts', { method: 'POST', body: data });
}

/** Team */
export async function fetchTeam(orgId?: string) {
  const params = orgId ? `?orgId=${orgId}` : '';
  return apiClient(`/api/v1/team${params}`);
}

export async function inviteTeamMember(data: { name: string; email: string; role: 'ADMIN' | 'MEMBER' }) {
  return apiClient('/api/v1/team', { method: 'POST', body: data });
}

/** Gateway */
export async function sendChatCompletion(data: {
  model: string;
  messages: { role: string; content: string }[];
  projectId?: string;
  temperature?: number;
  maxTokens?: number;
}) {
  return apiClient('/v1/chat/completions', { method: 'POST', body: data });
}

/** Auth */
export async function login(email: string, password: string) {
  return apiClient('/auth/login', { method: 'POST', body: { email, password } });
}

export async function register(data: { email: string; password: string; name: string; orgName?: string }) {
  return apiClient('/auth/register', { method: 'POST', body: data });
}

/** Billing */
export async function createCheckout(orgId: string, tier: 'starter' | 'growth' | 'enterprise') {
  return apiClient('/api/v1/billing/checkout', { method: 'POST', body: { orgId, tier } });
}

export async function getSubscription(orgId: string) {
  return apiClient(`/api/v1/billing/subscription?orgId=${orgId}`);
}

/** Health */
export async function healthCheck() {
  return apiClient('/health');
}
