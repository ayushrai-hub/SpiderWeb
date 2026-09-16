# Data Architecture

## Principles

1. **Raw data immutable.** Original files never destroyed. Normalized data is derived.
2. **Provenance on every fact.** Source, confidence, timestamp, evidence reference.
3. **Temporal by default.** Employment, relationships, positions track time ranges.
4. **Source-agnostic canonical model.** LinkedIn adapter maps to shared schema. Future adapters reuse same tables.
5. **Multi-tenant from row one.** Every table has workspace_id. Row-level security enforced.

## Storage Layers

### Layer 1: Object Storage (S3/MinIO)
```
/{workspace_id}/imports/{import_id}/raw/
  ├── archive.zip
  ├── Profile.csv
  ├── Connections.csv
  └── ...
```
Immutable. Checksummed. Never modified after upload.

### Layer 2: PostgreSQL (Canonical Relational)
Normalized domain model. All business queries hit this layer.

### Layer 3: pgvector (Semantic Index)
Embeddings for people, messages, documents. Powers semantic search.

### Layer 4: Redis (Cache + Queues)
Session cache, rate limiting, BullMQ job queues.

## Schema Organization

### Core Tables
- users, workspaces, workspace_members
- data_sources, imports, import_files

### Domain Tables
- people, person_identifiers, person_profiles, person_employment
- companies, company_identifiers
- roles, skills, education, certifications, projects, languages, honors, volunteering

### Relationship Tables
- relationships, connections, connection_events

### Communication Tables
- conversations, conversation_participants, messages, message_attachments

### Activity Tables
- activities, posts, comments, reactions, shares, reposts, votes, saved_items

### Job Tables
- jobs, job_applications, saved_jobs, job_alerts, job_preferences

### Content Tables
- events, learning_items, learning_activity

### Identity Tables
- emails, phone_numbers, verifications

### Intelligence Tables
- web_sources, web_observations, research_runs, research_evidence
- embeddings, documents, chunks
- insights, insight_evidence
- agent_conversations, agent_messages, agent_tool_calls
- analytics_snapshots

## Migration Strategy

- All schema changes via Drizzle migrations
- Never modify production schema manually
- Seed data separate from migrations
- Synthetic fixtures for testing (no real user data)
