import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

// Slack webhook status/config. The backend never returns the webhook URL.
export async function GET(req: NextRequest) {
  return proxyToBackend(req, { path: '/api/v1/alerts/config' });
}

export async function PATCH(req: NextRequest) {
  return proxyToBackend(req, { path: '/api/v1/alerts/config' });
}
