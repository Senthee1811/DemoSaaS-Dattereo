import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

// Forwards /api/v1/insights/* (attribution, forecast, investigation, model-comparison, recommendations) to the
// NestJS backend. Each path segment is encoded; auth headers and status codes pass through unchanged.
type Ctx = { params: Promise<{ path: string[] }> };
const target = async (ctx: Ctx) => `/api/v1/insights/${(await ctx.params).path.map(encodeURIComponent).join('/')}`;

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxyToBackend(req, { path: await target(ctx) });
}
export async function POST(req: NextRequest, ctx: Ctx) {
  return proxyToBackend(req, { path: await target(ctx), timeoutMs: 60_000 });
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return proxyToBackend(req, { path: await target(ctx) });
}
