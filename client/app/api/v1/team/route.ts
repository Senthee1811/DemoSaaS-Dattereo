import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

// Forwards to the NestJS backend (/api/v1/team); auth headers and status codes pass through.
export async function GET(req: NextRequest) {
  return proxyToBackend(req, { path: '/api/v1/team' });
}

export async function POST(req: NextRequest) {
  return proxyToBackend(req, { path: '/api/v1/team' });
}

export async function PATCH(req: NextRequest) {
  return proxyToBackend(req, { path: '/api/v1/team' });
}
