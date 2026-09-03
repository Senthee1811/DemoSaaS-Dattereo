import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { encryptApiKey, generateGatewayToken } from '@/lib/encryption';
import { logAuditEvent } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const db = getDb();

    let providerQuery = 'SELECT p.*, pr.name as project_name FROM provider_api_keys p JOIN projects pr ON p.project_id = pr.id';
    let gatewayQuery = 'SELECT g.*, pr.name as project_name FROM gateway_api_keys g JOIN projects pr ON g.project_id = pr.id';
    const params: any[] = [];

    if (projectId) {
      providerQuery += ' WHERE p.project_id = ?';
      gatewayQuery += ' WHERE g.project_id = ?';
      params.push(projectId);
    }

    providerQuery += ' ORDER BY p.created_at DESC';
    gatewayQuery += ' ORDER BY g.created_at DESC';

    const providerKeys = (projectId ? db.prepare(providerQuery).all(projectId) : db.prepare(providerQuery).all()) as any[];
    const gatewayKeys = (projectId ? db.prepare(gatewayQuery).all(projectId) : db.prepare(gatewayQuery).all()) as any[];

    const sanitizedProviderKeys = providerKeys.map(k => ({
      id: k.id,
      projectId: k.project_id,
      projectName: k.project_name,
      provider: k.provider,
      keyName: k.key_name,
      keyPrefix: k.key_prefix,
      isActive: Boolean(k.is_active),
      lastUsedAt: k.last_used_at,
      createdAt: k.created_at
    }));

    const sanitizedGatewayKeys = gatewayKeys.map(k => ({
      id: k.id,
      projectId: k.project_id,
      projectName: k.project_name,
      keyName: k.key_name,
      keyPrefix: k.key_prefix,
      rateLimitRpm: k.rate_limit_rpm,
      isActive: Boolean(k.is_active),
      lastUsedAt: k.last_used_at,
      createdAt: k.created_at
    }));

    return NextResponse.json({
      providerKeys: sanitizedProviderKeys,
      gatewayKeys: sanitizedGatewayKeys
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, projectId, provider, keyName, rawKey, rateLimitRpm } = body;
    const db = getDb();

    if (!projectId || !keyName) {
      return NextResponse.json({ error: 'Missing projectId or keyName' }, { status: 400 });
    }

    const project = db.prepare('SELECT org_id, name FROM projects WHERE id = ?').get(projectId) as any;
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (type === 'PROVIDER') {
      if (!provider || !rawKey) {
        return NextResponse.json({ error: 'Provider and rawKey are required' }, { status: 400 });
      }

      const prefix = rawKey.slice(0, 10) + '...';
      const encrypted = encryptApiKey(rawKey);
      const id = `pkey_${provider.toLowerCase()}_${Date.now().toString(36)}`;

      db.prepare(`
        INSERT INTO provider_api_keys (id, project_id, provider, key_name, key_prefix, encrypted_key, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `).run(id, projectId, provider, keyName, prefix, encrypted);

      logAuditEvent({
        orgId: project.org_id,
        projectId,
        actorName: 'Sarah Chen',
        actorEmail: 'sarah.chen@apexai.io',
        action: 'PROVIDER_KEY_ADDED',
        resourceType: 'PROVIDER_API_KEY',
        resourceId: id,
        metadata: { provider, keyName, prefix }
      });

      return NextResponse.json({ success: true, keyId: id }, { status: 201 });
    } else if (type === 'GATEWAY') {
      const { token, prefix, hashedSecret } = generateGatewayToken(projectId);
      const id = `gwk_${Date.now().toString(36)}`;

      db.prepare(`
        INSERT INTO gateway_api_keys (id, project_id, key_name, key_prefix, hashed_secret, rate_limit_rpm, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `).run(id, projectId, keyName, prefix, hashedSecret, rateLimitRpm || 600);

      logAuditEvent({
        orgId: project.org_id,
        projectId,
        actorName: 'Sarah Chen',
        actorEmail: 'sarah.chen@apexai.io',
        action: 'GATEWAY_KEY_GENERATED',
        resourceType: 'GATEWAY_API_KEY',
        resourceId: id,
        metadata: { keyName, prefix, rateLimitRpm }
      });

      // Return full token once for display to user
      return NextResponse.json({
        success: true,
        keyId: id,
        tokenSecret: token,
        prefix
      }, { status: 201 });
    } else {
      return NextResponse.json({ error: 'Invalid key type' }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const type = searchParams.get('type');

    if (!id || !type) {
      return NextResponse.json({ error: 'Missing id or type' }, { status: 400 });
    }

    const db = getDb();
    if (type === 'PROVIDER') {
      db.prepare('DELETE FROM provider_api_keys WHERE id = ?').run(id);
    } else {
      db.prepare('DELETE FROM gateway_api_keys WHERE id = ?').run(id);
    }

    return NextResponse.json({ success: true, message: 'Key revoked successfully' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
