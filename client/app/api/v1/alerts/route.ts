import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { recordBudgetAlert } from '@/lib/budget';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const db = getDb();

    let sql = `
      SELECT a.*, p.name as project_name
      FROM budget_alerts a
      LEFT JOIN projects p ON a.project_id = p.id
    `;
    const params: any[] = [];

    if (projectId) {
      sql += ' WHERE a.project_id = ?';
      params.push(projectId);
    }

    sql += ' ORDER BY a.triggered_at DESC LIMIT 50';

    const alerts = db.prepare(sql).all(...params).map((a: any) => ({
      ...a,
      isRead: Boolean(a.is_read)
    }));

    return NextResponse.json({ alerts });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, isRead, markAllRead } = body;
    const db = getDb();

    if (markAllRead) {
      db.prepare('UPDATE budget_alerts SET is_read = 1').run();
      return NextResponse.json({ success: true, message: 'All alerts marked as read' });
    }

    if (!id) {
      return NextResponse.json({ error: 'Alert ID is required' }, { status: 400 });
    }

    db.prepare('UPDATE budget_alerts SET is_read = ? WHERE id = ?').run(isRead ? 1 : 0, id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, channel, thresholdType, title, message } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    recordBudgetAlert({
      projectId,
      channel: channel || 'SLACK',
      thresholdType: thresholdType || 'PERCENT_80',
      thresholdValue: 500,
      title: title || '⚡ Test Alert Dispatched',
      message: message || 'This is a test notification dispatched from the SpendGuard Alert Center.'
    });

    return NextResponse.json({ success: true, message: 'Test alert generated and queued' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
