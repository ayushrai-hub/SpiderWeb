import { getDb } from "@intel/shared";

export interface AlertConfig {
  id: string;
  workspaceId: string;
  userId: string;
  name: string;
  type: AlertType;
  conditions: AlertConditions;
  channel: AlertChannel;
  enabled: boolean;
  frequency: AlertFrequency;
  lastTriggeredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AlertConditions {
  threshold: number;
  metric: string;
  comparison?: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
}

export type AlertType =
  | "cost_threshold"
  | "usage_spike"
  | "error_rate"
  | "token_limit"
  | "api_key_expiring";

export type AlertChannel = "email" | "slack" | "webhook";
export type AlertFrequency = "hourly" | "daily" | "weekly";

export interface Alert {
  id: string;
  workspaceId: string;
  type: AlertType;
  title: string;
  description: string;
  severity: "info" | "warning" | "critical";
  metadata: Record<string, any>;
  createdAt: Date;
}

function escapeString(str: string): string {
  return str.replace(/'/g, "''");
}

export async function createAlertConfig(
  workspaceId: string,
  userId: string,
  config: Omit<AlertConfig, 'id' | 'workspaceId' | 'userId' | 'createdAt' | 'updatedAt'>
): Promise<AlertConfig> {
  const db = getDb();
  const conditionsJson = JSON.stringify(config.conditions).replace(/'/g, "''");
  
  const result = await db.execute(`
    INSERT INTO alert_configs (workspace_id, user_id, name, type, conditions, channel, enabled, frequency)
    VALUES ('${workspaceId}', '${userId}', '${escapeString(config.name)}', '${escapeString(config.type)}', '${conditionsJson}'::jsonb, '${escapeString(config.channel)}', ${config.enabled}, '${escapeString(config.frequency)}')
    RETURNING *
  `);

  return result[0] as unknown as AlertConfig;
}

export async function getAlertConfigs(
  workspaceId: string,
  userId?: string
): Promise<AlertConfig[]> {
  const db = getDb();
  const userFilter = userId ? `AND user_id = '${userId}'` : '';
  
  const result = await db.execute(`
    SELECT * FROM alert_configs
    WHERE workspace_id = '${workspaceId}' ${userFilter}
    ORDER BY created_at DESC
  `);

  return result as unknown as AlertConfig[];
}

export async function getAlertConfig(
  workspaceId: string,
  alertId: string
): Promise<AlertConfig | null> {
  const db = getDb();
  
  const result = await db.execute(`
    SELECT * FROM alert_configs
    WHERE id = '${alertId}' AND workspace_id = '${workspaceId}'
    LIMIT 1
  `);

  return result.length > 0 ? result[0] as unknown as AlertConfig : null;
}

export async function updateAlertConfig(
  workspaceId: string,
  alertId: string,
  updates: Partial<Pick<AlertConfig, 'name' | 'conditions' | 'channel' | 'enabled' | 'frequency'>>
): Promise<AlertConfig | null> {
  const db = getDb();
  
  const setClauses: string[] = [];
  if (updates.name !== undefined) setClauses.push(`name = '${escapeString(updates.name)}'`);
  if (updates.conditions !== undefined) {
    const conditionsJson = JSON.stringify(updates.conditions).replace(/'/g, "''");
    setClauses.push(`conditions = '${conditionsJson}'::jsonb`);
  }
  if (updates.channel !== undefined) setClauses.push(`channel = '${escapeString(updates.channel)}'`);
  if (updates.enabled !== undefined) setClauses.push(`enabled = ${updates.enabled}`);
  if (updates.frequency !== undefined) setClauses.push(`frequency = '${escapeString(updates.frequency)}'`);
  
  setClauses.push('updated_at = NOW()');
  
  if (setClauses.length === 1) return null;

  await db.execute(`
    UPDATE alert_configs SET ${setClauses.join(', ')}
    WHERE id = '${alertId}' AND workspace_id = '${workspaceId}'
  `);

  return getAlertConfig(workspaceId, alertId);
}

export async function deleteAlertConfig(
  workspaceId: string,
  alertId: string
): Promise<boolean> {
  const db = getDb();
  
  const result = await db.execute(`
    DELETE FROM alert_configs
    WHERE id = '${alertId}' AND workspace_id = '${workspaceId}'
  `);

  return (result as any).rowCount > 0;
}

export async function checkAlerts(
  workspaceId: string,
  metrics: {
    cost?: number;
    tokenUsage?: number;
    errorRate?: number;
    requestCount?: number;
  }
): Promise<Alert[]> {
  const configs = await getAlertConfigs(workspaceId);
  const enabledConfigs = configs.filter(c => c.enabled);
  const triggered: Alert[] = [];
  const db = getDb();

  for (const config of enabledConfigs) {
    let shouldAlert = false;
    let description = "";
    let currentValue: number | undefined;

    switch (config.type) {
      case "cost_threshold":
        currentValue = metrics.cost;
        if (metrics.cost !== undefined && metrics.cost >= config.conditions.threshold) {
          shouldAlert = true;
          description = `Cost threshold exceeded: $${metrics.cost.toFixed(2)} >= $${config.conditions.threshold}`;
        }
        break;

      case "usage_spike":
        currentValue = metrics.requestCount;
        if (metrics.requestCount !== undefined && metrics.requestCount >= config.conditions.threshold) {
          shouldAlert = true;
          description = `Usage spike detected: ${metrics.requestCount} requests >= ${config.conditions.threshold}`;
        }
        break;

      case "error_rate":
        currentValue = metrics.errorRate;
        if (metrics.errorRate !== undefined && metrics.errorRate >= config.conditions.threshold) {
          shouldAlert = true;
          description = `Error rate exceeded: ${metrics.errorRate}% >= ${config.conditions.threshold}%`;
        }
        break;

      case "token_limit":
        currentValue = metrics.tokenUsage;
        if (metrics.tokenUsage !== undefined && metrics.tokenUsage >= config.conditions.threshold) {
          shouldAlert = true;
          description = `Token limit approached: ${metrics.tokenUsage} tokens >= ${config.conditions.threshold}`;
        }
        break;
    }

    if (shouldAlert) {
      const severity = config.conditions.threshold > 100 ? "critical" : "warning";
      
      // Create alert record in database
      const alertResult = await db.execute(`
        INSERT INTO alerts (workspace_id, user_id, alert_type, title, description, severity, metadata)
        VALUES ('${workspaceId}', '${config.userId}', '${escapeString(config.type)}', '${escapeString(config.name)}', '${escapeString(description)}', '${severity}', '{"threshold": ${config.conditions.threshold}, "currentValue": ${currentValue ?? 0}, "configId": "${config.id}"}'::jsonb)
        RETURNING *
      `);

      const alert = alertResult[0] as unknown as Alert;
      triggered.push(alert);

      // Update last triggered time
      await db.execute(`
        UPDATE alert_configs SET last_triggered_at = NOW()
        WHERE id = '${config.id}'
      `);

      // Log delivery attempt
      await db.execute(`
        INSERT INTO alert_deliveries (alert_config_id, workspace_id, status, channel, metadata)
        VALUES ('${config.id}', '${workspaceId}', 'pending', '${escapeString(config.channel)}', '{"alertType": "${config.type}"}'::jsonb)
      `);
    }
  }

  return triggered;
}

export async function getAlertHistory(
  workspaceId: string,
  options: {
    type?: AlertType;
    severity?: "info" | "warning" | "critical";
    since?: Date;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ alerts: Alert[]; total: number }> {
  const db = getDb();
  
  const whereClauses = [`workspace_id = '${workspaceId}'`];
  
  if (options.type) {
    whereClauses.push(`alert_type = '${escapeString(options.type)}'`);
  }
  if (options.severity) {
    whereClauses.push(`severity = '${escapeString(options.severity)}'`);
  }
  if (options.since) {
    whereClauses.push(`created_at >= '${options.since.toISOString()}'`);
  }

  const whereStr = whereClauses.join(' AND ');
  const limit = options.limit || 100;
  const offset = options.offset || 0;

  // Get total count
  const countResult = await db.execute(`
    SELECT COUNT(*) as count FROM alerts WHERE ${whereStr}
  `);
  const total = parseInt((countResult[0] as any).count, 10);

  // Get alerts
  const result = await db.execute(`
    SELECT * FROM alerts
    WHERE ${whereStr}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  return {
    alerts: result as unknown as Alert[],
    total,
  };
}

export async function markAlertAsRead(
  workspaceId: string,
  alertId: string
): Promise<boolean> {
  const db = getDb();
  
  const result = await db.execute(`
    UPDATE alerts SET read = true
    WHERE id = '${alertId}' AND workspace_id = '${workspaceId}'
  `);

  return (result as any).rowCount > 0;
}

export async function getAlertDeliveryHistory(
  workspaceId: string,
  alertConfigId?: string
): Promise<any[]> {
  const db = getDb();
  
  const configFilter = alertConfigId ? `AND alert_config_id = '${alertConfigId}'` : '';
  
  const result = await db.execute(`
    SELECT ad.*, ac.name as config_name, ac.type as config_type
    FROM alert_deliveries ad
    JOIN alert_configs ac ON ac.id = ad.alert_config_id
    WHERE ad.workspace_id = '${workspaceId}' ${configFilter}
    ORDER BY ad.created_at DESC
    LIMIT 100
  `);

  return result;
}

export async function evaluateAlerts(_workspaceId: string): Promise<{ evaluated: number; triggered: number }> {
  // This would be called by a worker to periodically check metrics and trigger alerts
  // For now, return a placeholder
  return { evaluated: 0, triggered: 0 };
}
