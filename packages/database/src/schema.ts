import { pgTable, uuid, text, timestamp, boolean, integer, jsonb, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// === ENUMS ===

export const workspaceRoleEnum = pgEnum('workspace_role', ['owner', 'admin', 'member']);
export const dataSourceTypeEnum = pgEnum('data_source_type', ['linkedin', 'gmail', 'outlook', 'github', 'crm', 'csv', 'json']);
export const importStatusEnum = pgEnum('import_status', ['pending', 'processing', 'completed', 'failed']);
export const fileStatusEnum = pgEnum('file_status', ['pending', 'parsed', 'normalized', 'failed']);
export const messageDirectionEnum = pgEnum('message_direction', ['inbound', 'outbound']);
export const activityTypeEnum = pgEnum('activity_type', ['post', 'comment', 'reaction', 'share', 'repost', 'vote']);
export const connectionStatusEnum = pgEnum('connection_status', ['connected', 'invited', 'pending']);
export const agentMessageRoleEnum = pgEnum('agent_message_role', ['user', 'assistant', 'tool']);

// === CORE TABLES ===

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  ownerId: uuid('owner_id').references(() => users.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const workspaceMembers = pgTable('workspace_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  role: workspaceRoleEnum('role').default('member').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('workspace_members_workspace_user_unique').on(t.workspaceId, t.userId),
]);

export const dataSources = pgTable('data_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  sourceType: dataSourceTypeEnum('source_type').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const imports = pgTable('imports', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  dataSourceId: uuid('data_source_id').references(() => dataSources.id),
  sourceType: dataSourceTypeEnum('source_type').notNull(),
  sourceVersion: text('source_version'),
  status: importStatusEnum('status').default('pending').notNull(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
  processingStartedAt: timestamp('processing_started_at', { withTimezone: true }),
  processingCompletedAt: timestamp('processing_completed_at', { withTimezone: true }),
  fileCount: integer('file_count').default(0),
  recordCount: integer('record_count').default(0),
  errorCount: integer('error_count').default(0),
  warningCount: integer('warning_count').default(0),
  archiveS3Key: text('archive_s3_key'),
  checksum: text('checksum'),
});

export const importFiles = pgTable('import_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  importId: uuid('import_id').references(() => imports.id).notNull(),
  filename: text('filename').notNull(),
  fileType: text('file_type'),
  recordCount: integer('record_count').default(0),
  status: fileStatusEnum('status').default('pending'),
  s3Key: text('s3_key'),
  checksum: text('checksum'),
  schemaInfo: jsonb('schema_info'),
  warnings: jsonb('warnings'),
  errors: jsonb('errors'),
});

// === DOMAIN TABLES ===

export const people = pgTable('people', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  canonicalName: text('canonical_name').notNull(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  headline: text('headline'),
  location: text('location'),
  profileUrl: text('profile_url'),
  sourceType: text('source_type'),
  sourceId: text('source_id'),
  confidence: integer('confidence').default(100),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('people_workspace_idx').on(t.workspaceId),
  index('people_name_idx').on(t.canonicalName),
]);

export const personIdentifiers = pgTable('person_identifiers', {
  id: uuid('id').primaryKey().defaultRandom(),
  personId: uuid('person_id').references(() => people.id).notNull(),
  identifierType: text('identifier_type').notNull(),
  identifierValue: text('identifier_value').notNull(),
  sourceType: text('source_type'),
  confidence: integer('confidence').default(100),
}, (t) => [
  uniqueIndex('person_identifiers_unique').on(t.identifierType, t.identifierValue),
]);

export const personProfiles = pgTable('person_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  personId: uuid('person_id').references(() => people.id).notNull(),
  fieldName: text('field_name').notNull(),
  fieldValue: text('field_value'),
  sourceFile: text('source_file'),
  observedAt: timestamp('observed_at', { withTimezone: true }),
});

export const personEmployment = pgTable('person_employment', {
  id: uuid('id').primaryKey().defaultRandom(),
  personId: uuid('person_id').references(() => people.id).notNull(),
  companyId: uuid('company_id').references(() => companies.id),
  companyName: text('company_name'),
  title: text('title'),
  description: text('description'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  isCurrent: boolean('is_current').default(false),
  sourceFile: text('source_file'),
  observedAt: timestamp('observed_at', { withTimezone: true }),
}, (t) => [
  index('person_employment_person_idx').on(t.personId),
]);

// === COMPANY TABLES ===

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  canonicalName: text('canonical_name').notNull(),
  domain: text('domain'),
  linkedinUrl: text('linkedin_url'),
  industry: text('industry'),
  size: text('size'),
  location: text('location'),
  description: text('description'),
  sourceType: text('source_type'),
  confidence: integer('confidence').default(100),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('companies_workspace_idx').on(t.workspaceId),
]);

export const companyIdentifiers = pgTable('company_identifiers', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').references(() => companies.id).notNull(),
  identifierType: text('identifier_type').notNull(),
  identifierValue: text('identifier_value').notNull(),
  sourceType: text('source_type'),
});

// === RELATIONSHIP TABLES ===

export const connections = pgTable('connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  personId: uuid('person_id').references(() => people.id).notNull(),
  connectedAt: timestamp('connected_at', { withTimezone: true }),
  sourceFile: text('source_file'),
  status: connectionStatusEnum('status').default('connected'),
}, (t) => [
  index('connections_workspace_idx').on(t.workspaceId),
  index('connections_person_idx').on(t.personId),
]);

export const connectionEvents = pgTable('connection_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  connectionId: uuid('connection_id').references(() => connections.id).notNull(),
  eventType: text('event_type').notNull(),
  eventAt: timestamp('event_at', { withTimezone: true }),
  sourceFile: text('source_file'),
});

// === COMMUNICATION TABLES ===

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  title: text('title'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  messageCount: integer('message_count').default(0),
  sourceType: text('source_type'),
}, (t) => [
  index('conversations_workspace_idx').on(t.workspaceId),
]);

export const conversationParticipants = pgTable('conversation_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => conversations.id).notNull(),
  personId: uuid('person_id').references(() => people.id).notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true }),
});

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  conversationId: uuid('conversation_id').references(() => conversations.id).notNull(),
  senderId: uuid('sender_id').references(() => people.id),
  content: text('content'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  direction: messageDirectionEnum('direction'),
  sourceFile: text('source_file'),
  hasAttachments: boolean('has_attachments').default(false),
}, (t) => [
  index('messages_workspace_idx').on(t.workspaceId),
  index('messages_conversation_idx').on(t.conversationId),
  index('messages_sent_at_idx').on(t.sentAt),
]);

export const messageAttachments = pgTable('message_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id').references(() => messages.id).notNull(),
  filename: text('filename'),
  fileType: text('file_type'),
  s3Key: text('s3_key'),
});

// === ACTIVITY TABLES ===

export const activities = pgTable('activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  personId: uuid('person_id').references(() => people.id),
  activityType: activityTypeEnum('activity_type').notNull(),
  content: text('content'),
  contentUrl: text('content_url'),
  createdAt: timestamp('created_at', { withTimezone: true }),
  sourceFile: text('source_file'),
}, (t) => [
  index('activities_workspace_idx').on(t.workspaceId),
]);

// === JOB TABLES ===

export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  companyId: uuid('company_id').references(() => companies.id),
  companyName: text('company_name'),
  title: text('title'),
  description: text('description'),
  location: text('location'),
  url: text('url'),
  sourceFile: text('source_file'),
  createdAt: timestamp('created_at', { withTimezone: true }),
}, (t) => [
  index('jobs_workspace_idx').on(t.workspaceId),
]);

export const jobApplications = pgTable('job_applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  jobId: uuid('job_id').references(() => jobs.id).notNull(),
  appliedAt: timestamp('applied_at', { withTimezone: true }),
  status: text('status'),
  sourceFile: text('source_file'),
});

export const savedJobs = pgTable('saved_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  jobId: uuid('job_id').references(() => jobs.id).notNull(),
  savedAt: timestamp('saved_at', { withTimezone: true }),
  sourceFile: text('source_file'),
});

// === SKILL/EDUCATION TABLES ===

export const skills = pgTable('skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  personId: uuid('person_id').references(() => people.id).notNull(),
  name: text('name').notNull(),
  endorsementCount: integer('endorsement_count').default(0),
  sourceFile: text('source_file'),
});

export const education = pgTable('education', {
  id: uuid('id').primaryKey().defaultRandom(),
  personId: uuid('person_id').references(() => people.id).notNull(),
  schoolName: text('school_name'),
  degree: text('degree'),
  fieldOfStudy: text('field_of_study'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  sourceFile: text('source_file'),
});

// === IDENTITY TABLES ===

export const emails = pgTable('emails', {
  id: uuid('id').primaryKey().defaultRandom(),
  personId: uuid('person_id').references(() => people.id).notNull(),
  email: text('email').notNull(),
  isPrimary: boolean('is_primary').default(false),
  sourceFile: text('source_file'),
});

export const phoneNumbers = pgTable('phone_numbers', {
  id: uuid('id').primaryKey().defaultRandom(),
  personId: uuid('person_id').references(() => people.id).notNull(),
  phoneNumber: text('phone_number').notNull(),
  type: text('type'),
  sourceFile: text('source_file'),
});

// === INTELLIGENCE TABLES ===

export const embeddings = pgTable('embeddings', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  model: text('model'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('embeddings_workspace_idx').on(t.workspaceId),
  index('embeddings_entity_idx').on(t.entityType, t.entityId),
]);

export const insights = pgTable('insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  explanation: text('explanation'),
  confidence: integer('confidence'),
  supportingMetrics: jsonb('supporting_metrics'),
  sourceRecords: jsonb('source_records'),
  generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
});

// === AGENT TABLES ===

export const agentConversations = pgTable('agent_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  title: text('title'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const agentMessages = pgTable('agent_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').references(() => agentConversations.id).notNull(),
  role: agentMessageRoleEnum('role').notNull(),
  content: text('content'),
  toolName: text('tool_name'),
  toolInput: jsonb('tool_input'),
  toolOutput: jsonb('tool_output'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// === ANALYTICS TABLES ===

export const analyticsSnapshots = pgTable('analytics_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  snapshotDate: timestamp('snapshot_date', { withTimezone: true }).notNull(),
  metricType: text('metric_type').notNull(),
  metricData: jsonb('metric_data'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('analytics_snapshots_unique').on(t.workspaceId, t.snapshotDate, t.metricType),
]);

// === RELATIONS ===

export const usersRelations = relations(users, ({ many }) => ({
  workspaces: many(workspaces),
  workspaceMembers: many(workspaceMembers),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  owner: one(users, { fields: [workspaces.ownerId], references: [users.id] }),
  members: many(workspaceMembers),
  dataSources: many(dataSources),
  imports: many(imports),
  people: many(people),
  companies: many(companies),
}));

export const peopleRelations = relations(people, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [people.workspaceId], references: [workspaces.id] }),
  identifiers: many(personIdentifiers),
  profiles: many(personProfiles),
  employment: many(personEmployment),
  skills: many(skills),
  education: many(education),
  connections: many(connections),
}));

export const companiesRelations = relations(companies, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [companies.workspaceId], references: [workspaces.id] }),
  identifiers: many(companyIdentifiers),
  employment: many(personEmployment),
  jobs: many(jobs),
}));

// === RLS POLICIES ===
// Row-Level Security policies for multi-tenant isolation
// These are raw SQL statements to apply after migration

export const rlsPolicies = `
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_employment ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE education ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;

-- Workspace-based policies (most tables)
CREATE POLICY workspace_isolation ON workspaces
  USING (id = current_setting('app.current_workspace_id')::uuid);

CREATE POLICY workspace_members_policy ON workspace_members
  USING (workspace_id = current_setting('app.current_workspace_id')::uuid);

CREATE POLICY people_workspace_isolation ON people
  USING (workspace_id = current_setting('app.current_workspace_id')::uuid);

CREATE POLICY connections_workspace_isolation ON connections
  USING (workspace_id = current_setting('app.current_workspace_id')::uuid);

CREATE POLICY connection_events_workspace_isolation ON connection_events
  USING (connection_id IN (
    SELECT id FROM connections WHERE workspace_id = current_setting('app.current_workspace_id')::uuid
  ));

CREATE POLICY conversations_workspace_isolation ON conversations
  USING (workspace_id = current_setting('app.current_workspace_id')::uuid);

CREATE POLICY conversation_participants_isolation ON conversation_participants
  USING (conversation_id IN (
    SELECT id FROM conversations WHERE workspace_id = current_setting('app.current_workspace_id')::uuid
  ));

CREATE POLICY messages_workspace_isolation ON messages
  USING (conversation_id IN (
    SELECT id FROM conversations WHERE workspace_id = current_setting('app.current_workspace_id')::uuid
  ));

CREATE POLICY message_attachments_isolation ON message_attachments
  USING (message_id IN (
    SELECT m.id FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE c.workspace_id = current_setting('app.current_workspace_id')::uuid
  ));

CREATE POLICY emails_workspace_isolation ON emails
  USING (workspace_id = current_setting('app.current_workspace_id')::uuid);

CREATE POLICY companies_workspace_isolation ON companies
  USING (workspace_id = current_setting('app.current_workspace_id')::uuid);

CREATE POLICY company_identifiers_isolation ON company_identifiers
  USING (company_id IN (
    SELECT id FROM companies WHERE workspace_id = current_setting('app.current_workspace_id')::uuid
  ));

CREATE POLICY person_employment_workspace_isolation ON person_employment
  USING (workspace_id = current_setting('app.current_workspace_id')::uuid);

CREATE POLICY person_profiles_isolation ON person_profiles
  USING (person_id IN (
    SELECT id FROM people WHERE workspace_id = current_setting('app.current_workspace_id')::uuid
  ));

CREATE POLICY person_identifiers_isolation ON person_identifiers
  USING (person_id IN (
    SELECT id FROM people WHERE workspace_id = current_setting('app.current_workspace_id')::uuid
  ));

CREATE POLICY education_isolation ON education
  USING (person_id IN (
    SELECT id FROM people WHERE workspace_id = current_setting('app.current_workspace_id')::uuid
  ));

CREATE POLICY skills_isolation ON skills
  USING (person_id IN (
    SELECT id FROM people WHERE workspace_id = current_setting('app.current_workspace_id')::uuid
  ));

CREATE POLICY phone_numbers_isolation ON phone_numbers
  USING (person_id IN (
    SELECT id FROM people WHERE workspace_id = current_setting('app.current_workspace_id')::uuid
  ));

CREATE POLICY jobs_workspace_isolation ON jobs
  USING (workspace_id = current_setting('app.current_workspace_id')::uuid);

CREATE POLICY saved_jobs_workspace_isolation ON saved_jobs
  USING (workspace_id = current_setting('app.current_workspace_id')::uuid);

CREATE POLICY job_applications_workspace_isolation ON job_applications
  USING (workspace_id = current_setting('app.current_workspace_id')::uuid);

CREATE POLICY data_sources_workspace_isolation ON data_sources
  USING (workspace_id = current_setting('app.current_workspace_id')::uuid);

CREATE POLICY imports_workspace_isolation ON imports
  USING (workspace_id = current_setting('app.current_workspace_id')::uuid);

CREATE POLICY import_files_isolation ON import_files
  USING (import_id IN (
    SELECT id FROM imports WHERE workspace_id = current_setting('app.current_workspace_id')::uuid
  ));

CREATE POLICY embeddings_workspace_isolation ON embeddings
  USING (workspace_id = current_setting('app.current_workspace_id')::uuid);

CREATE POLICY insights_workspace_isolation ON insights
  USING (workspace_id = current_setting('app.current_workspace_id')::uuid);

CREATE POLICY analytics_workspace_isolation ON analytics_snapshots
  USING (workspace_id = current_setting('app.current_workspace_id')::uuid);

CREATE POLICY activities_workspace_isolation ON activities
  USING (workspace_id = current_setting('app.current_workspace_id')::uuid);

CREATE POLICY agent_conversations_workspace_isolation ON agent_conversations
  USING (workspace_id = current_setting('app.current_workspace_id')::uuid);

CREATE POLICY agent_messages_isolation ON agent_messages
  USING (conversation_id IN (
    SELECT id FROM agent_conversations WHERE workspace_id = current_setting('app.current_workspace_id')::uuid
  ));

-- User-specific policies
CREATE POLICY users_own_data ON users
  USING (id = current_setting('app.current_user_id')::uuid);

-- Service role bypass (for API access)
CREATE POLICY service_role_bypass ON users
  USING (current_setting('role') = 'service_role');

CREATE POLICY service_role_bypass ON workspaces
  USING (current_setting('role') = 'service_role');

CREATE POLICY service_role_bypass ON workspace_members
  USING (current_setting('role') = 'service_role');

-- Add indexes for common queries
CREATE INDEX idx_people_workspace ON people(workspace_id);
CREATE INDEX idx_connections_workspace ON connections(workspace_id);
CREATE INDEX idx_connections_person ON connections(person_id);
CREATE INDEX idx_conversations_workspace ON conversations(workspace_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_companies_workspace ON companies(workspace_id);
CREATE INDEX idx_imports_workspace ON imports(workspace_id);
CREATE INDEX idx_embeddings_workspace ON embeddings(workspace_id);
CREATE INDEX idx_insights_workspace ON insights(workspace_id);
CREATE INDEX idx_analytics_workspace ON analytics_snapshots(workspace_id);
CREATE INDEX idx_activities_workspace ON activities(workspace_id);
CREATE INDEX idx_agent_conversations_workspace ON agent_conversations(workspace_id);
`;

// === CREDENTIAL STORAGE ===

export const userCredentials = pgTable('user_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  provider: text('provider').notNull(),
  encryptedKey: text('encrypted_key').notNull(),
  iv: text('iv').notNull(),
  authTag: text('auth_tag').notNull(),
  salt: text('salt').notNull(),
  keyFingerprint: text('key_fingerprint').notNull(),
  status: text('status').default('active').notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('user_credentials_workspace_user_provider_unique').on(t.workspaceId, t.userId, t.provider),
]);

// === AUDIT LOGS ===

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  action: text('action').notNull(),
  resource: text('resource').notNull(),
  resourceId: text('resource_id'),
  metadata: jsonb('metadata'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('audit_logs_workspace_idx').on(t.workspaceId),
  index('audit_logs_user_idx').on(t.userId),
  index('audit_logs_action_idx').on(t.action),
  index('audit_logs_created_at_idx').on(t.createdAt),
]);

// === AI USAGE TRACKING ===

export const aiUsage = pgTable('ai_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  promptTokens: integer('prompt_tokens').default(0).notNull(),
  completionTokens: integer('completion_tokens').default(0).notNull(),
  totalTokens: integer('total_tokens').default(0).notNull(),
  estimatedCost: integer('estimated_cost').default(0).notNull(),
  latencyMs: integer('latency_ms').default(0).notNull(),
  feature: text('feature').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('ai_usage_workspace_idx').on(t.workspaceId),
  index('ai_usage_user_idx').on(t.userId),
  index('ai_usage_created_at_idx').on(t.createdAt),
]);

// === ALERTS ===

export const alerts = pgTable('alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  alertType: text('alert_type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  severity: text('severity').default('info').notNull(),
  read: boolean('read').default(false).notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('alerts_workspace_idx').on(t.workspaceId),
  index('alerts_user_idx').on(t.userId),
  index('alerts_read_idx').on(t.read),
]);

// === USER SETTINGS ===

export const userSettings = pgTable('user_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull().unique(),
  defaultProvider: text('default_provider').default('openai'),
  defaultModel: text('default_model').default('gpt-4o-mini'),
  dailyUsageLimit: integer('daily_usage_limit').default(1000),
  monthlyUsageLimit: integer('monthly_usage_limit').default(10000),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// === VECTOR EMBEDDINGS ===

export const vectorEmbeddings = pgTable('vector_embeddings', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  entityType: text('entity_type').notNull(), // 'person', 'company', 'message', etc.
  entityId: uuid('entity_id').notNull(),
  embedding: text('embedding').notNull(), // JSON array of floats
  model: text('model').notNull(), // 'text-embedding-3-small', etc.
  dimensions: integer('dimensions').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('vector_embeddings_workspace_idx').on(t.workspaceId),
  index('vector_embeddings_entity_idx').on(t.entityType, t.entityId),
  index('vector_embeddings_model_idx').on(t.model),
]);

// === ALERT CONFIGURATIONS ===

export const alertConfigs = pgTable('alert_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'cost_threshold', 'usage_spike', 'error_rate', 'token_limit', 'api_key_expiring'
  conditions: jsonb('conditions').notNull(), // { threshold: number, metric: string, ... }
  channel: text('channel').default('email').notNull(), // 'email', 'slack', 'webhook'
  enabled: boolean('enabled').default(true).notNull(),
  frequency: text('frequency').default('daily').notNull(), // 'hourly', 'daily', 'weekly'
  lastTriggeredAt: timestamp('last_triggered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('alert_configs_workspace_idx').on(t.workspaceId),
  index('alert_configs_user_idx').on(t.userId),
  index('alert_configs_enabled_idx').on(t.enabled),
]);

// === ALERT DELIVERIES ===

export const alertDeliveries = pgTable('alert_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  alertConfigId: uuid('alert_config_id').references(() => alertConfigs.id).notNull(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  status: text('status').notNull(), // 'pending', 'sent', 'failed', 'skipped'
  channel: text('channel').notNull(),
  recipient: text('recipient'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  error: text('error'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('alert_deliveries_config_idx').on(t.alertConfigId),
  index('alert_deliveries_workspace_idx').on(t.workspaceId),
  index('alert_deliveries_status_idx').on(t.status),
]);

export default rlsPolicies;
