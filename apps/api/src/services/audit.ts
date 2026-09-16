import { getSupabase } from '@intel/shared';

export interface AuditEvent {
  workspaceId: string;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function logAuditEvent(event: AuditEvent): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('audit_logs')
    .insert({
      workspace_id: event.workspaceId,
      user_id: event.userId,
      action: event.action,
      resource: event.resource,
      resource_id: event.resourceId,
      metadata: event.metadata || {},
      ip_address: event.ipAddress,
      user_agent: event.userAgent,
    });

  if (error) {
    console.error('Failed to log audit event:', error.message);
  }
}

export async function getAuditLogs(
  workspaceId: string,
  options: {
    userId?: string;
    action?: string;
    resource?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ logs: any[]; total: number }> {
  const supabase = getSupabase();
  let query = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .eq('workspace_id', workspaceId);

  if (options.userId) {
    query = query.eq('user_id', options.userId);
  }
  if (options.action) {
    query = query.eq('action', options.action);
  }
  if (options.resource) {
    query = query.eq('resource', options.resource);
  }
  if (options.startDate) {
    query = query.gte('created_at', options.startDate.toISOString());
  }
  if (options.endDate) {
    query = query.lte('created_at', options.endDate.toISOString());
  }

  const limit = options.limit || 50;
  const offset = options.offset || 0;

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`Failed to get audit logs: ${error.message}`);

  return {
    logs: data || [],
    total: count || 0,
  };
}
