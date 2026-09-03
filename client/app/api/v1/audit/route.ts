import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const limit = Number(searchParams.get('limit')) || 50;
    const db = getDb();

    let query = `
      SELECT a.*, p.name as project_name
      FROM audit_logs a
      LEFT JOIN projects p ON a.project_id = p.id
    `;
    const params: any[] = [];

    if (projectId) {
      query += ' WHERE a.project_id = ?';
      params.push(projectId);
    }

    query += ' ORDER BY a.created_at DESC LIMIT ?';
    params.push(limit);

    const logs = db.prepare(query).all(...params);

    return NextResponse.json({ logs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
