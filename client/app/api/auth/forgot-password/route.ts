import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

// Forwards to the NestJS backend (/auth/forgot-password); auth headers and status codes pass through.
export async function POST(req: NextRequest) {
  return proxyToBackend(req, { path: '/auth/forgot-password' });
}
