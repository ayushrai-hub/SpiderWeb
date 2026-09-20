-- 0004 — Relationship intelligence data model.
--
-- Brings the schema in line with what the LinkedIn ingestion pipeline and the
-- dashboard actually need:
--   * import bookkeeping (metadata, per-stage record counts, durations)
--   * denormalised, indexed connection attributes for filtering + search
--   * workspace ownership on every child table (isolation is enforced in SQL)
--   * deterministic dedupe keys so re-importing an export is idempotent
--   * user-authored notes and tags that imports must never destroy
--
-- Every statement is idempotent so the file is safe to re-run.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ===========================================================================
-- Status columns: enum -> text + CHECK.
-- Enums could not express partial/cancelled outcomes and ALTER TYPE ADD VALUE
-- is awkward inside migration transactions.
-- ===========================================================================

ALTER TABLE imports ALTER COLUMN status DROP DEFAULT;
ALTER TABLE imports ALTER COLUMN status TYPE text USING status::text;
ALTER TABLE imports ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE imports DROP CONSTRAINT IF EXISTS imports_status_check;
ALTER TABLE imports ADD CONSTRAINT imports_status_check
  CHECK (status IN ('pending','processing','completed','partially_completed','failed','cancelled'));

ALTER TABLE import_files ALTER COLUMN status DROP DEFAULT;
ALTER TABLE import_files ALTER COLUMN status TYPE text USING status::text;
ALTER TABLE import_files ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE import_files DROP CONSTRAINT IF EXISTS import_files_status_check;
ALTER TABLE import_files ADD CONSTRAINT import_files_status_check
  CHECK (status IN ('pending','parsed','normalized','failed','skipped'));

-- ===========================================================================
-- imports
-- ===========================================================================

ALTER TABLE imports ADD COLUMN IF NOT EXISTS filename text;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id);
ALTER TABLE imports ADD COLUMN IF NOT EXISTS records_discovered integer NOT NULL DEFAULT 0;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS records_imported integer NOT NULL DEFAULT 0;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS records_updated integer NOT NULL DEFAULT 0;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS records_duplicate integer NOT NULL DEFAULT 0;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS records_rejected integer NOT NULL DEFAULT 0;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS duration_ms integer;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS error_code text;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS error_message text;

CREATE INDEX IF NOT EXISTS imports_workspace_uploaded_idx ON imports (workspace_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS imports_workspace_checksum_idx ON imports (workspace_id, checksum);

-- ===========================================================================
-- import_files
-- ===========================================================================

ALTER TABLE import_files ADD COLUMN IF NOT EXISTS file_size bigint NOT NULL DEFAULT 0;
ALTER TABLE import_files ADD COLUMN IF NOT EXISTS dataset text;
ALTER TABLE import_files ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE import_files ADD COLUMN IF NOT EXISTS records_imported integer NOT NULL DEFAULT 0;
ALTER TABLE import_files ADD COLUMN IF NOT EXISTS records_rejected integer NOT NULL DEFAULT 0;
ALTER TABLE import_files ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE import_files ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS import_files_import_idx ON import_files (import_id);

-- Deleting an import must take its file rows with it.
ALTER TABLE import_files DROP CONSTRAINT IF EXISTS import_files_import_id_imports_id_fk;
ALTER TABLE import_files ADD CONSTRAINT import_files_import_id_imports_id_fk
  FOREIGN KEY (import_id) REFERENCES imports(id) ON DELETE CASCADE;

-- ===========================================================================
-- people — denormalised current role/company so filters and sorts are indexable
-- ===========================================================================

ALTER TABLE people ADD COLUMN IF NOT EXISTS current_company text;
ALTER TABLE people ADD COLUMN IF NOT EXISTS current_title text;
ALTER TABLE people ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE people ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE people ADD COLUMN IF NOT EXISTS connected_at timestamptz;
ALTER TABLE people ADD COLUMN IF NOT EXISTS last_interaction_at timestamptz;
ALTER TABLE people ADD COLUMN IF NOT EXISTS interaction_count integer NOT NULL DEFAULT 0;
ALTER TABLE people ADD COLUMN IF NOT EXISTS is_self boolean NOT NULL DEFAULT false;
ALTER TABLE people ADD COLUMN IF NOT EXISTS dedupe_key text;
ALTER TABLE people ADD COLUMN IF NOT EXISTS first_import_id uuid;
ALTER TABLE people ADD COLUMN IF NOT EXISTS last_import_id uuid;

-- Deterministic identity within a workspace: profile URL > email > name+company.
-- Computed by the ingestion pipeline; the unique index makes re-imports idempotent.
UPDATE people SET dedupe_key = 'id:' || id::text WHERE dedupe_key IS NULL;
ALTER TABLE people ALTER COLUMN dedupe_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS people_workspace_dedupe_key_uniq ON people (workspace_id, dedupe_key);

CREATE INDEX IF NOT EXISTS people_workspace_company_idx ON people (workspace_id, lower(current_company));
CREATE INDEX IF NOT EXISTS people_workspace_location_idx ON people (workspace_id, lower(location));
CREATE INDEX IF NOT EXISTS people_workspace_industry_idx ON people (workspace_id, lower(industry));
CREATE INDEX IF NOT EXISTS people_workspace_connected_idx ON people (workspace_id, connected_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS people_workspace_self_idx ON people (workspace_id) WHERE is_self;

CREATE INDEX IF NOT EXISTS people_name_trgm_idx ON people USING gin (canonical_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS people_company_trgm_idx ON people USING gin (current_company gin_trgm_ops);
CREATE INDEX IF NOT EXISTS people_title_trgm_idx ON people USING gin (current_title gin_trgm_ops);

ALTER TABLE people ADD COLUMN IF NOT EXISTS search_document tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(canonical_name, '') || ' ' ||
      coalesce(headline, '') || ' ' ||
      coalesce(current_title, '') || ' ' ||
      coalesce(current_company, '') || ' ' ||
      coalesce(location, '') || ' ' ||
      coalesce(industry, '') || ' ' ||
      coalesce(email, '')
    )
  ) STORED;
CREATE INDEX IF NOT EXISTS people_search_document_idx ON people USING gin (search_document);

-- ===========================================================================
-- person_identifiers — the old unique index was global, so two workspaces
-- importing the same LinkedIn profile collided and the second import lost rows.
-- ===========================================================================

DROP INDEX IF EXISTS person_identifiers_unique;
CREATE UNIQUE INDEX IF NOT EXISTS person_identifiers_person_type_value_uniq
  ON person_identifiers (person_id, identifier_type, identifier_value);
CREATE INDEX IF NOT EXISTS person_identifiers_lookup_idx
  ON person_identifiers (identifier_type, identifier_value);
ALTER TABLE person_identifiers DROP CONSTRAINT IF EXISTS person_identifiers_person_id_people_id_fk;
ALTER TABLE person_identifiers ADD CONSTRAINT person_identifiers_person_id_people_id_fk
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE;

-- ===========================================================================
-- person_employment — workspace ownership + idempotent upserts
-- ===========================================================================

ALTER TABLE person_employment ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id);
ALTER TABLE person_employment ADD COLUMN IF NOT EXISTS started_on date;
ALTER TABLE person_employment ADD COLUMN IF NOT EXISTS ended_on date;
DELETE FROM person_employment WHERE person_id IS NULL;
UPDATE person_employment e SET workspace_id = p.workspace_id
  FROM people p WHERE p.id = e.person_id AND e.workspace_id IS NULL;
DELETE FROM person_employment WHERE workspace_id IS NULL;
ALTER TABLE person_employment ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE person_employment ALTER COLUMN person_id SET NOT NULL;

ALTER TABLE person_employment DROP CONSTRAINT IF EXISTS person_employment_person_id_people_id_fk;
ALTER TABLE person_employment ADD CONSTRAINT person_employment_person_id_people_id_fk
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS person_employment_uniq
  ON person_employment (person_id, lower(coalesce(company_name, '')), lower(coalesce(title, '')), coalesce(start_date, ''));
CREATE INDEX IF NOT EXISTS person_employment_workspace_company_idx
  ON person_employment (workspace_id, lower(company_name));
CREATE INDEX IF NOT EXISTS person_employment_current_idx
  ON person_employment (workspace_id, is_current);


-- person_employment carries the same normalised company key the ingestion
-- pipeline computes, so linking employment to companies is an exact join
-- rather than a re-implementation of the normalisation rules in SQL.
ALTER TABLE person_employment ADD COLUMN IF NOT EXISTS company_key text;
CREATE INDEX IF NOT EXISTS person_employment_company_key_idx
  ON person_employment (workspace_id, company_key);

-- ===========================================================================
-- education / skills / emails / phone_numbers
-- ===========================================================================

ALTER TABLE education ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id);
UPDATE education e SET workspace_id = p.workspace_id FROM people p WHERE p.id = e.person_id AND e.workspace_id IS NULL;
DELETE FROM education WHERE workspace_id IS NULL;
ALTER TABLE education ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE education DROP CONSTRAINT IF EXISTS education_person_id_people_id_fk;
ALTER TABLE education ADD CONSTRAINT education_person_id_people_id_fk
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS education_uniq
  ON education (person_id, lower(coalesce(school_name, '')), lower(coalesce(degree, '')), lower(coalesce(field_of_study, '')));
CREATE INDEX IF NOT EXISTS education_workspace_school_idx ON education (workspace_id, lower(school_name));

ALTER TABLE skills ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id);
UPDATE skills s SET workspace_id = p.workspace_id FROM people p WHERE p.id = s.person_id AND s.workspace_id IS NULL;
DELETE FROM skills WHERE workspace_id IS NULL;
ALTER TABLE skills ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE skills DROP CONSTRAINT IF EXISTS skills_person_id_people_id_fk;
ALTER TABLE skills ADD CONSTRAINT skills_person_id_people_id_fk
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS skills_uniq ON skills (person_id, lower(name));
CREATE INDEX IF NOT EXISTS skills_workspace_name_idx ON skills (workspace_id, lower(name));

ALTER TABLE emails ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id);
UPDATE emails e SET workspace_id = p.workspace_id FROM people p WHERE p.id = e.person_id AND e.workspace_id IS NULL;
DELETE FROM emails WHERE workspace_id IS NULL;
ALTER TABLE emails ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_person_id_people_id_fk;
ALTER TABLE emails ADD CONSTRAINT emails_person_id_people_id_fk
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS emails_uniq ON emails (person_id, lower(email));

ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id);
UPDATE phone_numbers n SET workspace_id = p.workspace_id FROM people p WHERE p.id = n.person_id AND n.workspace_id IS NULL;
DELETE FROM phone_numbers WHERE workspace_id IS NULL;
ALTER TABLE phone_numbers ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE phone_numbers DROP CONSTRAINT IF EXISTS phone_numbers_person_id_people_id_fk;
ALTER TABLE phone_numbers ADD CONSTRAINT phone_numbers_person_id_people_id_fk
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS phone_numbers_uniq ON phone_numbers (person_id, phone_number);

ALTER TABLE person_profiles ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id);
UPDATE person_profiles pp SET workspace_id = p.workspace_id FROM people p WHERE p.id = pp.person_id AND pp.workspace_id IS NULL;
DELETE FROM person_profiles WHERE workspace_id IS NULL;
ALTER TABLE person_profiles ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE person_profiles DROP CONSTRAINT IF EXISTS person_profiles_person_id_people_id_fk;
ALTER TABLE person_profiles ADD CONSTRAINT person_profiles_person_id_people_id_fk
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS person_profiles_uniq ON person_profiles (person_id, field_name);

-- ===========================================================================
-- connections
-- ===========================================================================

ALTER TABLE connections ADD COLUMN IF NOT EXISTS import_id uuid;
ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_person_id_people_id_fk;
ALTER TABLE connections ADD CONSTRAINT connections_person_id_people_id_fk
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE;
DELETE FROM connections a USING connections b
  WHERE a.ctid < b.ctid AND a.workspace_id = b.workspace_id AND a.person_id = b.person_id;
CREATE UNIQUE INDEX IF NOT EXISTS connections_workspace_person_uniq ON connections (workspace_id, person_id);
CREATE INDEX IF NOT EXISTS connections_workspace_connected_idx ON connections (workspace_id, connected_at DESC NULLS LAST);

ALTER TABLE connection_events DROP CONSTRAINT IF EXISTS connection_events_connection_id_connections_id_fk;
ALTER TABLE connection_events ADD CONSTRAINT connection_events_connection_id_connections_id_fk
  FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE;

-- ===========================================================================
-- companies — normalised name for dedupe, rollup counters for the dashboard
-- ===========================================================================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS normalized_name text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS connection_count integer NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS current_count integer NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS former_count integer NOT NULL DEFAULT 0;
UPDATE companies SET normalized_name = lower(btrim(canonical_name)) WHERE normalized_name IS NULL;
ALTER TABLE companies ALTER COLUMN normalized_name SET NOT NULL;
DELETE FROM companies a USING companies b
  WHERE a.ctid < b.ctid AND a.workspace_id = b.workspace_id AND a.normalized_name = b.normalized_name;
CREATE UNIQUE INDEX IF NOT EXISTS companies_workspace_normalized_uniq ON companies (workspace_id, normalized_name);
CREATE INDEX IF NOT EXISTS companies_workspace_count_idx ON companies (workspace_id, connection_count DESC);
CREATE INDEX IF NOT EXISTS companies_name_trgm_idx ON companies USING gin (canonical_name gin_trgm_ops);

ALTER TABLE company_identifiers DROP CONSTRAINT IF EXISTS company_identifiers_company_id_companies_id_fk;
ALTER TABLE company_identifiers ADD CONSTRAINT company_identifiers_company_id_companies_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS company_identifiers_uniq
  ON company_identifiers (company_id, identifier_type, identifier_value);

ALTER TABLE person_employment DROP CONSTRAINT IF EXISTS person_employment_company_id_companies_id_fk;
ALTER TABLE person_employment ADD CONSTRAINT person_employment_company_id_companies_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

-- ===========================================================================
-- conversations / messages — stable external ids so re-imports dedupe
-- ===========================================================================

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES people(id) ON DELETE SET NULL;
-- Not a partial index: ON CONFLICT cannot infer a partial index without
-- repeating its predicate, and NULL external_ids never conflict anyway.
DROP INDEX IF EXISTS conversations_workspace_external_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS conversations_workspace_external_uniq
  ON conversations (workspace_id, external_id);
CREATE INDEX IF NOT EXISTS conversations_workspace_last_message_idx
  ON conversations (workspace_id, last_message_at DESC NULLS LAST);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_name text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS recipient_name text;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_conversation_id_conversations_id_fk;
ALTER TABLE messages ADD CONSTRAINT messages_conversation_id_conversations_id_fk
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_id_people_id_fk;
ALTER TABLE messages ADD CONSTRAINT messages_sender_id_people_id_fk
  FOREIGN KEY (sender_id) REFERENCES people(id) ON DELETE SET NULL;
DROP INDEX IF EXISTS messages_workspace_external_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS messages_workspace_external_uniq
  ON messages (workspace_id, external_id);

ALTER TABLE conversation_participants DROP CONSTRAINT IF EXISTS conversation_participants_conversation_id_conversations_id_fk;
ALTER TABLE conversation_participants ADD CONSTRAINT conversation_participants_conversation_id_conversations_id_fk
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
ALTER TABLE conversation_participants DROP CONSTRAINT IF EXISTS conversation_participants_person_id_people_id_fk;
ALTER TABLE conversation_participants ADD CONSTRAINT conversation_participants_person_id_people_id_fk
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS conversation_participants_uniq
  ON conversation_participants (conversation_id, person_id);

ALTER TABLE message_attachments DROP CONSTRAINT IF EXISTS message_attachments_message_id_messages_id_fk;
ALTER TABLE message_attachments ADD CONSTRAINT message_attachments_message_id_messages_id_fk
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE;

-- ===========================================================================
-- activities / jobs
-- ===========================================================================

ALTER TABLE activities ADD COLUMN IF NOT EXISTS external_id text;
DROP INDEX IF EXISTS activities_workspace_external_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS activities_workspace_external_uniq
  ON activities (workspace_id, external_id);
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_person_id_people_id_fk;
ALTER TABLE activities ADD CONSTRAINT activities_person_id_people_id_fk
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS applied_at timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS saved_at timestamptz;
DROP INDEX IF EXISTS jobs_workspace_external_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS jobs_workspace_external_uniq
  ON jobs (workspace_id, external_id);
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_company_id_companies_id_fk;
ALTER TABLE jobs ADD CONSTRAINT jobs_company_id_companies_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE job_applications DROP CONSTRAINT IF EXISTS job_applications_job_id_jobs_id_fk;
ALTER TABLE job_applications ADD CONSTRAINT job_applications_job_id_jobs_id_fk
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;
ALTER TABLE saved_jobs DROP CONSTRAINT IF EXISTS saved_jobs_job_id_jobs_id_fk;
ALTER TABLE saved_jobs ADD CONSTRAINT saved_jobs_job_id_jobs_id_fk
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;


-- ===========================================================================
-- Observed touchpoints with a person (endorsements, recommendations,
-- invitations). Stored rather than counted inline so re-importing the same
-- archive cannot inflate interaction counters.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS person_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  kind text NOT NULL,
  occurred_at timestamptz,
  external_id text NOT NULL,
  source_file text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS person_interactions_external_uniq
  ON person_interactions (workspace_id, external_id);
CREATE INDEX IF NOT EXISTS person_interactions_person_idx
  ON person_interactions (person_id, occurred_at DESC NULLS LAST);

-- ===========================================================================
-- User-authored data. Imports must never touch these tables.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS person_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS person_notes_person_idx ON person_notes (person_id, created_at DESC);
CREATE INDEX IF NOT EXISTS person_notes_workspace_idx ON person_notes (workspace_id);

CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tags_workspace_name_uniq ON tags (workspace_id, lower(name));

CREATE TABLE IF NOT EXISTS person_tags (
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (person_id, tag_id)
);
CREATE INDEX IF NOT EXISTS person_tags_tag_idx ON person_tags (tag_id);
CREATE INDEX IF NOT EXISTS person_tags_workspace_idx ON person_tags (workspace_id);

-- ===========================================================================
-- Cascade deletes for the remaining workspace-owned tables so "reset my
-- network" and "delete workspace" cannot leave orphans behind.
-- ===========================================================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass::text AS tbl
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.confrelid
    WHERE c.contype = 'f'
      AND rel.relname = 'workspaces'
      AND c.confdeltype = 'a'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE',
      r.tbl, r.conname
    );
  END LOOP;
END $$;
