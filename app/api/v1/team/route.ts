import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { logAuditEvent } from '@/lib/audit';

export async function GET() {
  try {
    const db = getDb();
    const org = db.prepare('SELECT * FROM organizations LIMIT 1').get() as any;
    const users = db.prepare('SELECT * FROM users ORDER BY created_at ASC').all();

    return NextResponse.json({
      organization: org,
      users
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, role } = body;

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    const db = getDb();
    const org = db.prepare('SELECT id FROM organizations LIMIT 1').get() as any;
    const orgId = org ? org.id : 'org_spendguard_demo';

    const userId = `usr_${email.split('@')[0].replace(/[^a-z0-9]/g, '_')}_${Date.now().toString(36).substring(2, 5)}`;
    
    db.prepare(`
      INSERT INTO users (id, org_id, name, email, role, avatar_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, orgId, name, email, role || 'MEMBER', `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`);

    logAuditEvent({
      orgId,
      actorName: 'Sarah Chen',
      actorEmail: 'sarah.chen@apexai.io',
      action: 'TEAM_MEMBER_INVITED',
      resourceType: 'USER',
      resourceId: userId,
      metadata: { name, email, role: role || 'MEMBER' }
    });

    return NextResponse.json({ success: true, userId }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, role } = body;

    if (!id || !role) {
      return NextResponse.json({ error: 'User ID and role are required' }, { status: 400 });
    }

    const db = getDb();
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);

    return NextResponse.json({ success: true, message: 'Role updated' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
