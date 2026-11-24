import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

// Forwards /api/v1/audit/* (attempts, exposure, reconcile, estimator-accuracy) to the NestJS backend. The backend scopes
// every call to the caller's organization and checks the role; nothing here widens access. /api/v1/audit/export keeps
// its own route (a static route takes precedence over this catch-all).
type Ctx = { params: Promise<{ path: string[] }> };
const target = async (ctx: Ctx) => `/api/v1/audit/${(await ctx.params).path.map(encodeURIComponent).join('/')}`;

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxyToBackend(req, { path: await target(ctx) });
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return proxyToBackend(req, { path: await target(ctx) });
}
