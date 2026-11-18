import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

// Forwards to the NestJS backend (/v1/chat/completions); auth headers and status codes pass through.
export async function POST(req: NextRequest) {
  return proxyToBackend(req, { path: '/v1/chat/completions', timeoutMs: 120000 });
}
