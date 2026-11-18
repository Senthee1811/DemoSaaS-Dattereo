import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

// Forwards to the NestJS backend (/auth/reset-password); auth headers and status codes pass through.
export async function POST(req: NextRequest) {
  return proxyToBackend(req, { path: '/auth/reset-password' });
}
