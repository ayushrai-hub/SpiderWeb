-- 0005 — Analytics: saved segments, insight provenance, lookup indexes.

CREATE TABLE IF NOT EXISTS network_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  query jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS network_segments_workspace_name_uniq
  ON network_segments (workspace_id, lower(name));

CREATE INDEX IF NOT EXISTS network_segments_workspace_idx
  ON network_segments (workspace_id);

ALTER TABLE insights ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE insights ADD COLUMN IF NOT EXISTS calculation jsonb;
ALTER TABLE insights ADD COLUMN IF NOT EXISTS time_period jsonb;
ALTER TABLE insights ADD COLUMN IF NOT EXISTS trust_level text;

CREATE INDEX IF NOT EXISTS people_workspace_last_import_idx ON people (workspace_id, last_import_id);
CREATE INDEX IF NOT EXISTS people_workspace_first_import_idx ON people (workspace_id, first_import_id);
CREATE INDEX IF NOT EXISTS person_employment_company_key_idx ON person_employment (workspace_id, company_key);
CREATE INDEX IF NOT EXISTS analytics_snapshots_workspace_idx ON analytics_snapshots (workspace_id, snapshot_date DESC);
