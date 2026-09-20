import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  date,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// === ENUMS ===
// `imports.status` and `import_files.status` are text + CHECK rather than
// enums (see migration 0004) so new outcomes can be added without ALTER TYPE.

export const workspaceRoleEnum = pgEnum('workspace_role', ['owner', 'admin', 'member']);
export const dataSourceTypeEnum = pgEnum('data_source_type', [
  'linkedin',
  'gmail',
  'outlook',
  'github',
  'crm',
  'csv',
  'json',
]);
export const messageDirectionEnum = pgEnum('message_direction', ['inbound', 'outbound']);
export const activityTypeEnum = pgEnum('activity_type', [
  'post',
  'comment',
  'reaction',
  'share',
  'repost',
  'vote',
]);
export const connectionStatusEnum = pgEnum('connection_status', ['connected', 'invited', 'pending']);

export const IMPORT_STATUSES = [
  'pending',
  'processing',
  'completed',
  'partially_completed',
  'failed',
  'cancelled',
] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const IMPORT_FILE_STATUSES = ['pending', 'parsed', 'normalized', 'failed', 'skipped'] as const;
export type ImportFileStatus = (typeof IMPORT_FILE_STATUSES)[number];

// === CORE ===

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
  ownerId: uuid('owner_id')
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    role: workspaceRoleEnum('role').default('member').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('workspace_members_workspace_user_unique').on(t.workspaceId, t.userId)]
);

export const dataSources = pgTable('data_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .references(() => workspaces.id, { onDelete: 'cascade' })
    .notNull(),
  sourceType: dataSourceTypeEnum('source_type').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// === IMPORTS ===

export const imports = pgTable(
  'imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    dataSourceId: uuid('data_source_id').references(() => dataSources.id),
    createdBy: uuid('created_by').references(() => users.id),
    sourceType: dataSourceTypeEnum('source_type').notNull(),
    sourceVersion: text('source_version'),
    /** One of IMPORT_STATUSES. */
    status: text('status').default('pending').notNull(),
    filename: text('filename'),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
    processingStartedAt: timestamp('processing_started_at', { withTimezone: true }),
    processingCompletedAt: timestamp('processing_completed_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    fileCount: integer('file_count').default(0),
    recordCount: integer('record_count').default(0),
    recordsDiscovered: integer('records_discovered').default(0).notNull(),
    recordsImported: integer('records_imported').default(0).notNull(),
    recordsUpdated: integer('records_updated').default(0).notNull(),
    recordsDuplicate: integer('records_duplicate').default(0).notNull(),
    recordsRejected: integer('records_rejected').default(0).notNull(),
    errorCount: integer('error_count').default(0),
    warningCount: integer('warning_count').default(0),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    archiveS3Key: text('archive_s3_key'),
    checksum: text('checksum'),
    metadata: jsonb('metadata').default({}).notNull(),
  },
  (t) => [
    index('imports_workspace_uploaded_idx').on(t.workspaceId, t.uploadedAt),
    index('imports_workspace_checksum_idx').on(t.workspaceId, t.checksum),
  ]
);

export const importFiles = pgTable(
  'import_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    importId: uuid('import_id')
      .references(() => imports.id, { onDelete: 'cascade' })
      .notNull(),
    filename: text('filename').notNull(),
    fileType: text('file_type'),
    /** Detected LinkedIn dataset key, e.g. `connections`. Null when unrecognised. */
    dataset: text('dataset'),
    fileSize: bigint('file_size', { mode: 'number' }).default(0).notNull(),
    recordCount: integer('record_count').default(0),
    recordsImported: integer('records_imported').default(0).notNull(),
    recordsRejected: integer('records_rejected').default(0).notNull(),
    /** One of IMPORT_FILE_STATUSES. */
    status: text('status').default('pending'),
    reason: text('reason'),
    s3Key: text('s3_key'),
    checksum: text('checksum'),
    schemaInfo: jsonb('schema_info'),
    warnings: jsonb('warnings'),
    errors: jsonb('errors'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('import_files_import_idx').on(t.importId)]
);

// === PEOPLE ===

export const people = pgTable(
  'people',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    canonicalName: text('canonical_name').notNull(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    headline: text('headline'),
    location: text('location'),
    industry: text('industry'),
    profileUrl: text('profile_url'),
    email: text('email'),
    /** Denormalised from person_employment so list filters stay indexable. */
    currentCompany: text('current_company'),
    currentTitle: text('current_title'),
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    lastInteractionAt: timestamp('last_interaction_at', { withTimezone: true }),
    interactionCount: integer('interaction_count').default(0).notNull(),
    /** True for the archive owner's own profile. */
    isSelf: boolean('is_self').default(false).notNull(),
    /** Deterministic identity within the workspace: url > email > name+company. */
    dedupeKey: text('dedupe_key').notNull(),
    firstImportId: uuid('first_import_id'),
    lastImportId: uuid('last_import_id'),
    sourceType: text('source_type'),
    sourceId: text('source_id'),
    confidence: integer('confidence').default(100),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('people_workspace_idx').on(t.workspaceId),
    uniqueIndex('people_workspace_dedupe_key_uniq').on(t.workspaceId, t.dedupeKey),
    index('people_workspace_connected_idx').on(t.workspaceId, t.connectedAt),
  ]
);

export const personIdentifiers = pgTable(
  'person_identifiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    personId: uuid('person_id')
      .references(() => people.id, { onDelete: 'cascade' })
      .notNull(),
    identifierType: text('identifier_type').notNull(),
    identifierValue: text('identifier_value').notNull(),
    sourceType: text('source_type'),
    confidence: integer('confidence').default(100),
  },
  (t) => [
    uniqueIndex('person_identifiers_person_type_value_uniq').on(
      t.personId,
      t.identifierType,
      t.identifierValue
    ),
    index('person_identifiers_lookup_idx').on(t.identifierType, t.identifierValue),
  ]
);

export const personProfiles = pgTable(
  'person_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    personId: uuid('person_id')
      .references(() => people.id, { onDelete: 'cascade' })
      .notNull(),
    fieldName: text('field_name').notNull(),
    fieldValue: text('field_value'),
    sourceFile: text('source_file'),
    observedAt: timestamp('observed_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('person_profiles_uniq').on(t.personId, t.fieldName)]
);

export const personEmployment = pgTable(
  'person_employment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    personId: uuid('person_id')
      .references(() => people.id, { onDelete: 'cascade' })
      .notNull(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    companyName: text('company_name'),
    /** Normalised company key, computed by the ingestion pipeline. */
    companyKey: text('company_key'),
    title: text('title'),
    description: text('description'),
    /** Raw LinkedIn strings, preserved verbatim. */
    startDate: text('start_date'),
    endDate: text('end_date'),
    /** Parsed equivalents used for ordering and tenure maths. */
    startedOn: date('started_on'),
    endedOn: date('ended_on'),
    isCurrent: boolean('is_current').default(false),
    sourceFile: text('source_file'),
    observedAt: timestamp('observed_at', { withTimezone: true }),
  },
  (t) => [
    index('person_employment_person_idx').on(t.personId),
    index('person_employment_current_idx').on(t.workspaceId, t.isCurrent),
  ]
);

// === COMPANIES ===

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    canonicalName: text('canonical_name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    domain: text('domain'),
    linkedinUrl: text('linkedin_url'),
    industry: text('industry'),
    size: text('size'),
    location: text('location'),
    description: text('description'),
    /** Maintained by the ingestion pipeline's aggregation step. */
    connectionCount: integer('connection_count').default(0).notNull(),
    currentCount: integer('current_count').default(0).notNull(),
    formerCount: integer('former_count').default(0).notNull(),
    sourceType: text('source_type'),
    confidence: integer('confidence').default(100),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('companies_workspace_idx').on(t.workspaceId),
    uniqueIndex('companies_workspace_normalized_uniq').on(t.workspaceId, t.normalizedName),
    index('companies_workspace_count_idx').on(t.workspaceId, t.connectionCount),
  ]
);

export const companyIdentifiers = pgTable(
  'company_identifiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .references(() => companies.id, { onDelete: 'cascade' })
      .notNull(),
    identifierType: text('identifier_type').notNull(),
    identifierValue: text('identifier_value').notNull(),
    sourceType: text('source_type'),
  },
  (t) => [uniqueIndex('company_identifiers_uniq').on(t.companyId, t.identifierType, t.identifierValue)]
);

// === RELATIONSHIPS ===

export const connections = pgTable(
  'connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    personId: uuid('person_id')
      .references(() => people.id, { onDelete: 'cascade' })
      .notNull(),
    importId: uuid('import_id'),
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    sourceFile: text('source_file'),
    status: connectionStatusEnum('status').default('connected'),
  },
  (t) => [
    uniqueIndex('connections_workspace_person_uniq').on(t.workspaceId, t.personId),
    index('connections_workspace_connected_idx').on(t.workspaceId, t.connectedAt),
  ]
);

export const connectionEvents = pgTable('connection_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  connectionId: uuid('connection_id')
    .references(() => connections.id, { onDelete: 'cascade' })
    .notNull(),
  eventType: text('event_type').notNull(),
  eventAt: timestamp('event_at', { withTimezone: true }),
  sourceFile: text('source_file'),
});

// === COMMUNICATION ===

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    personId: uuid('person_id').references(() => people.id, { onDelete: 'set null' }),
    externalId: text('external_id'),
    title: text('title'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    messageCount: integer('message_count').default(0),
    sourceType: text('source_type'),
  },
  (t) => [
    index('conversations_workspace_idx').on(t.workspaceId),
    index('conversations_workspace_last_message_idx').on(t.workspaceId, t.lastMessageAt),
  ]
);

export const conversationParticipants = pgTable(
  'conversation_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    personId: uuid('person_id')
      .references(() => people.id, { onDelete: 'cascade' })
      .notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('conversation_participants_uniq').on(t.conversationId, t.personId)]
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    conversationId: uuid('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    senderId: uuid('sender_id').references(() => people.id, { onDelete: 'set null' }),
    externalId: text('external_id'),
    senderName: text('sender_name'),
    recipientName: text('recipient_name'),
    subject: text('subject'),
    content: text('content'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    direction: messageDirectionEnum('direction'),
    sourceFile: text('source_file'),
    hasAttachments: boolean('has_attachments').default(false),
  },
  (t) => [
    index('messages_workspace_idx').on(t.workspaceId),
    index('messages_conversation_idx').on(t.conversationId),
    index('messages_sent_at_idx').on(t.sentAt),
  ]
);

export const messageAttachments = pgTable('message_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id')
    .references(() => messages.id, { onDelete: 'cascade' })
    .notNull(),
  filename: text('filename'),
  fileType: text('file_type'),
  s3Key: text('s3_key'),
});

// === ACTIVITY ===

export const activities = pgTable(
  'activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    personId: uuid('person_id').references(() => people.id, { onDelete: 'set null' }),
    externalId: text('external_id'),
    activityType: activityTypeEnum('activity_type').notNull(),
    content: text('content'),
    contentUrl: text('content_url'),
    createdAt: timestamp('created_at', { withTimezone: true }),
    sourceFile: text('source_file'),
  },
  (t) => [index('activities_workspace_idx').on(t.workspaceId)]
);

// === JOBS ===

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    externalId: text('external_id'),
    companyName: text('company_name'),
    title: text('title'),
    description: text('description'),
    location: text('location'),
    url: text('url'),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    savedAt: timestamp('saved_at', { withTimezone: true }),
    sourceFile: text('source_file'),
    createdAt: timestamp('created_at', { withTimezone: true }),
  },
  (t) => [index('jobs_workspace_idx').on(t.workspaceId)]
);

export const jobApplications = pgTable('job_applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .references(() => workspaces.id, { onDelete: 'cascade' })
    .notNull(),
  jobId: uuid('job_id')
    .references(() => jobs.id, { onDelete: 'cascade' })
    .notNull(),
  appliedAt: timestamp('applied_at', { withTimezone: true }),
  status: text('status'),
  sourceFile: text('source_file'),
});

export const savedJobs = pgTable('saved_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .references(() => workspaces.id, { onDelete: 'cascade' })
    .notNull(),
  jobId: uuid('job_id')
    .references(() => jobs.id, { onDelete: 'cascade' })
    .notNull(),
  savedAt: timestamp('saved_at', { withTimezone: true }),
  sourceFile: text('source_file'),
});

// === SKILLS / EDUCATION / CONTACT ===

export const skills = pgTable(
  'skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    personId: uuid('person_id')
      .references(() => people.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    endorsementCount: integer('endorsement_count').default(0),
    sourceFile: text('source_file'),
  },
  (t) => [uniqueIndex('skills_uniq').on(t.personId, t.name)]
);

export const education = pgTable('education', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .references(() => workspaces.id, { onDelete: 'cascade' })
    .notNull(),
  personId: uuid('person_id')
    .references(() => people.id, { onDelete: 'cascade' })
    .notNull(),
  schoolName: text('school_name'),
  degree: text('degree'),
  fieldOfStudy: text('field_of_study'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  sourceFile: text('source_file'),
});

export const emails = pgTable('emails', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .references(() => workspaces.id, { onDelete: 'cascade' })
    .notNull(),
  personId: uuid('person_id')
    .references(() => people.id, { onDelete: 'cascade' })
    .notNull(),
  email: text('email').notNull(),
  isPrimary: boolean('is_primary').default(false),
  sourceFile: text('source_file'),
});

export const phoneNumbers = pgTable('phone_numbers', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .references(() => workspaces.id, { onDelete: 'cascade' })
    .notNull(),
  personId: uuid('person_id')
    .references(() => people.id, { onDelete: 'cascade' })
    .notNull(),
  phoneNumber: text('phone_number').notNull(),
  type: text('type'),
  sourceFile: text('source_file'),
});

/** Observed touchpoints with a person: endorsements, recommendations, invitations. */
export const personInteractions = pgTable(
  'person_interactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    personId: uuid('person_id')
      .references(() => people.id, { onDelete: 'cascade' })
      .notNull(),
    kind: text('kind').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    externalId: text('external_id').notNull(),
    sourceFile: text('source_file'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('person_interactions_external_uniq').on(t.workspaceId, t.externalId),
    index('person_interactions_person_idx').on(t.personId, t.occurredAt),
  ]
);

// === USER-AUTHORED DATA (never written by imports) ===

export const personNotes = pgTable(
  'person_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    personId: uuid('person_id')
      .references(() => people.id, { onDelete: 'cascade' })
      .notNull(),
    authorId: uuid('author_id').references(() => users.id),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('person_notes_person_idx').on(t.personId, t.createdAt)]
);

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('tags_workspace_name_uniq').on(t.workspaceId, t.name)]
);

export const personTags = pgTable(
  'person_tags',
  {
    personId: uuid('person_id')
      .references(() => people.id, { onDelete: 'cascade' })
      .notNull(),
    tagId: uuid('tag_id')
      .references(() => tags.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.personId, t.tagId] }), index('person_tags_tag_idx').on(t.tagId)]
);

// === ANALYTICS / AUDIT ===

export const networkSegments = pgTable(
  'network_segments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    description: text('description'),
    query: jsonb('query').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('network_segments_workspace_idx').on(t.workspaceId)]
);

export const analyticsSnapshots = pgTable(
  'analytics_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    snapshotDate: timestamp('snapshot_date', { withTimezone: true }).notNull(),
    metricType: text('metric_type').notNull(),
    metricData: jsonb('metric_data'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('analytics_snapshots_unique').on(t.workspaceId, t.snapshotDate, t.metricType)]
);

export const insights = pgTable('insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .references(() => workspaces.id, { onDelete: 'cascade' })
    .notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  explanation: text('explanation'),
  category: text('category'),
  confidence: integer('confidence'),
  trustLevel: text('trust_level'),
  supportingMetrics: jsonb('supporting_metrics'),
  sourceRecords: jsonb('source_records'),
  calculation: jsonb('calculation'),
  timePeriod: jsonb('time_period'),
  generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id').references(() => users.id),
    action: text('action').notNull(),
    resource: text('resource').notNull(),
    resourceId: text('resource_id'),
    metadata: jsonb('metadata').default({}).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('audit_logs_workspace_created_idx').on(t.workspaceId, t.createdAt)]
);

// === RELATIONS ===

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  owner: one(users, { fields: [workspaces.ownerId], references: [users.id] }),
  members: many(workspaceMembers),
  imports: many(imports),
  people: many(people),
  companies: many(companies),
}));

export const peopleRelations = relations(people, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [people.workspaceId], references: [workspaces.id] }),
  identifiers: many(personIdentifiers),
  employment: many(personEmployment),
  skills: many(skills),
  education: many(education),
  notes: many(personNotes),
  tags: many(personTags),
}));

export const companiesRelations = relations(companies, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [companies.workspaceId], references: [workspaces.id] }),
  identifiers: many(companyIdentifiers),
  employment: many(personEmployment),
  jobs: many(jobs),
}));
