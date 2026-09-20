import { query } from '@intel/shared';

export interface AuditEvent {
  workspaceId: string;
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Record a sensitive or destructive operation.
 *
 * Metadata holds identifiers and counts only — never imported record contents,
 * email addresses or message text.
 */
export async function recordAudit(event: AuditEvent): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (workspace_id, user_id, action, resource, resource_id, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [
        event.workspaceId,
        event.userId ?? null,
        event.action,
        event.resource,
        event.resourceId ?? null,
        // Passed as an object: postgres.js encodes it once for the jsonb cast.
        event.metadata ?? {},
        event.ipAddress ?? null,
        event.userAgent ?? null,
      ]
    );
  } catch {
    // Auditing must never break the operation it is recording.
  }
}

export async function listAudit(workspaceId: string, limit = 50) {
  return query<Record<string, unknown>>(
    `SELECT action, resource, resource_id, metadata, created_at
     FROM audit_logs WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [workspaceId, limit]
  );
}
