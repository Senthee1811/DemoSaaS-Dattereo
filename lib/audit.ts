import { getDb } from './db';

export function logAuditEvent(entry: {
  orgId: string;
  projectId?: string;
  actorName: string;
  actorEmail: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, any>;
}) {
  const db = getDb();
  const id = `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  
  db.prepare(`
    INSERT INTO audit_logs (id, org_id, project_id, actor_name, actor_email, action, resource_type, resource_id, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    entry.orgId,
    entry.projectId || null,
    entry.actorName,
    entry.actorEmail,
    entry.action,
    entry.resourceType,
    entry.resourceId,
    entry.metadata ? JSON.stringify(entry.metadata) : null
  );

  return id;
}
