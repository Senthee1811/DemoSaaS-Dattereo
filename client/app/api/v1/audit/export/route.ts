import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const format = searchParams.get('format') || 'csv';
    const db = getDb();

    let sql = `
      SELECT 
        r.id as request_id,
        r.created_at as timestamp,
        p.name as project_name,
        u.name as user_name,
        u.email as user_email,
        r.provider,
        r.model,
        r.tokens_in,
        r.tokens_out,
        r.total_tokens,
        r.cost_estimate,
        r.latency_ms,
        r.status_code,
        r.is_anomaly,
        r.anomaly_reason,
        r.is_blocked
      FROM requests r
      LEFT JOIN projects p ON r.project_id = p.id
      LEFT JOIN users u ON r.user_id = u.id
    `;
    const params: any[] = [];

    if (projectId) {
      sql += ' WHERE r.project_id = ?';
      params.push(projectId);
    }

    sql += ' ORDER BY r.created_at DESC LIMIT 5000';

    const records = db.prepare(sql).all(...params) as any[];

    if (format === 'json') {
      return NextResponse.json({ records });
    }

    // Generate CSV
    const headers = [
      'Request ID',
      'Timestamp (UTC)',
      'Project Name',
      'User Name',
      'User Email',
      'AI Provider',
      'Model',
      'Prompt Tokens',
      'Completion Tokens',
      'Total Tokens',
      'Cost Estimate (USD)',
      'Latency (ms)',
      'HTTP Status',
      'Is Anomaly',
      'Anomaly Reason',
      'Is Hard Blocked'
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvRows = [
      headers.join(','),
      ...records.map(r => [
        escapeCsv(r.request_id),
        escapeCsv(r.timestamp),
        escapeCsv(r.project_name || 'N/A'),
        escapeCsv(r.user_name || 'N/A'),
        escapeCsv(r.user_email || 'N/A'),
        escapeCsv(r.provider),
        escapeCsv(r.model),
        r.tokens_in,
        r.tokens_out,
        r.total_tokens,
        Number(r.cost_estimate).toFixed(6),
        r.latency_ms,
        r.status_code,
        r.is_anomaly ? 'YES' : 'NO',
        escapeCsv(r.anomaly_reason || ''),
        r.is_blocked ? 'YES' : 'NO'
      ].join(','))
    ];

    const csvContent = csvRows.join('\r\n');
    const filename = `spendguard-audit-export-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
