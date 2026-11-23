/** Response shapes of the security endpoints (server/src/modules/auth, GET /auth/security etc.). */
export interface SecurityOverviewData {
  email: string;
  role: string;
  organization: string | null;
  accountCreatedAt: string;
  password: { set: boolean; changedAt: string | null };
  sessions: { active: number; currentStartedAt: string | null; trackingAvailable: boolean };
  lastFailedSignInAt: string | null;
  mfa: { supported: boolean };
}

export interface SessionRow {
  id: string;
  device: string;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

export interface SessionsData {
  sessions: SessionRow[];
  currentSessionKnown: boolean;
}

export type SecurityEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET'
  | 'SESSION_REVOKED'
  | 'OTHER_SESSIONS_REVOKED';

export interface SecurityEvent {
  id: string;
  type: SecurityEventType | string;
  at: string;
  device: string | null;
  ip: string | null;
}

export interface SecurityActivityData {
  events: SecurityEvent[];
  total: number;
  limit: number;
  offset: number;
}
