-- Add alert_configs table
CREATE TABLE IF NOT EXISTS alert_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  conditions JSONB NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  enabled BOOLEAN NOT NULL DEFAULT true,
  frequency TEXT NOT NULL DEFAULT 'daily',
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add alert_deliveries table
CREATE TABLE IF NOT EXISTS alert_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_config_id UUID NOT NULL REFERENCES alert_configs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient TEXT,
  sent_at TIMESTAMPTZ,
  error TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_alert_configs_workspace ON alert_configs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_alert_configs_user ON alert_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_alert_configs_enabled ON alert_configs(enabled);
CREATE INDEX IF NOT EXISTS idx_alert_deliveries_config ON alert_deliveries(alert_config_id);
CREATE INDEX IF NOT EXISTS idx_alert_deliveries_workspace ON alert_deliveries(workspace_id);
CREATE INDEX IF NOT EXISTS idx_alert_deliveries_status ON alert_deliveries(status);

-- Enable RLS
ALTER TABLE alert_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_deliveries ENABLE ROW LEVEL SECURITY;

-- Add RLS policies
CREATE POLICY alert_configs_workspace_isolation ON alert_configs
  FOR ALL USING (workspace_id = current_setting('app.current_workspace_id')::uuid);

CREATE POLICY alert_deliveries_workspace_isolation ON alert_deliveries
  FOR ALL USING (workspace_id = current_setting('app.current_workspace_id')::uuid);
