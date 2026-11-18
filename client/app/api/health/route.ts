import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

// Forwards to the NestJS backend (/health); auth headers and status codes pass through.
export async function GET(req: NextRequest) {
  return proxyToBackend(req, { path: '/health' });
}
