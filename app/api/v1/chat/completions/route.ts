import { NextRequest, NextResponse } from 'next/server';
import { executeGatewayChat } from '@/lib/gateway-service';
import { getDb } from '@/lib/db';
import { hashToken } from '@/lib/encryption';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    let bearerToken = '';
    if (authHeader.startsWith('Bearer ')) {
      bearerToken = authHeader.slice(7).trim();
    }

    const body = await req.json();
    const { model, messages, project_id, projectId, temperature, max_tokens, maxTokens, stream, user_id, userId } = body;

    if (!model || !messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: { message: 'Missing required parameters: model and messages array.', type: 'invalid_request_error' } },
        { status: 400 }
      );
    }

    let resolvedProjectId = project_id || projectId || req.headers.get('x-spendguard-project-id') || req.headers.get('x-project-id');
    const resolvedUserId = user_id || userId || req.headers.get('x-spendguard-user-id') || 'usr_sarah_chen';

    // If Bearer token provided, check if it maps to a gateway key
    if (bearerToken) {
      const db = getDb();
      const tokenHashed = hashToken(bearerToken);
      const gwKey = db.prepare('SELECT project_id, is_active FROM gateway_api_keys WHERE hashed_secret = ?').get(tokenHashed) as any;
      
      if (gwKey) {
        if (!gwKey.is_active) {
          return NextResponse.json(
            { error: { message: 'SpendGuard Gateway API key has been deactivated.', type: 'authentication_error' } },
            { status: 401 }
          );
        }
        resolvedProjectId = gwKey.project_id;
      }
    }

    // Default to first active project if not explicitly supplied or inferred
    if (!resolvedProjectId) {
      const db = getDb();
      const firstProj = db.prepare('SELECT id FROM projects WHERE is_blocked = 0 LIMIT 1').get() as any;
      resolvedProjectId = firstProj ? firstProj.id : 'proj_copilot';
    }

    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
    const clientSdk = req.headers.get('user-agent') || 'openai-compatible-client';

    const result = await executeGatewayChat({
      projectId: resolvedProjectId,
      userId: resolvedUserId,
      model,
      messages,
      temperature,
      maxTokens: max_tokens || maxTokens,
      stream: !!stream,
      clientIp,
      clientSdk
    });

    const response = NextResponse.json(result.data, { status: result.status });
    
    // Attach custom governance headers
    for (const [k, v] of Object.entries(result.headers)) {
      response.headers.set(k, v);
    }

    return response;
  } catch (error: any) {
    console.error('Unified Gateway API Error:', error);
    return NextResponse.json(
      { error: { message: error.message || 'Internal gateway error', type: 'api_error' } },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-SpendGuard-Project-Id'
    }
  });
}
