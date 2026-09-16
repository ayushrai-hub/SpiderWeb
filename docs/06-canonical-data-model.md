# Canonical Data Model

## Entity-Relationship Overview

```
User ── Workspace ── DataSource ── Import ── ImportFile
 │         │              │
 │         │              └──→ Raw files in S3
 │         │
 │         └── Person ── PersonIdentifier
 │              │         PersonProfile
 │              │         PersonEmployment
 │              │
 │              ├── Company ── CompanyIdentifier
 │              │
 │              ├── Connection ── ConnectionEvent
 │              │
 │              ├── Conversation ── ConversationParticipant
 │              │       │
 │              │       └── Message ── MessageAttachment
 │              │
 │              ├── Activity (Post/Comment/Reaction/Share)
 │              │
 │              ├── Job ── JobApplication / SavedJob
 │              │
 │              ├── Skill / Education / Certification
 │              │
 │              └── Email / PhoneNumber
 │
 ├── Embedding ── Document ── Chunk
 │
 ├── Insight ── InsightEvidence
 │
 ├── AgentConversation ── AgentMessage ── AgentToolCall
 │
 └── AnalyticsSnapshot
```

## Table Definitions (Summary)

### users
- id (UUID PK)
- email (unique)
- name
- avatar_url
- created_at
- updated_at

### workspaces
- id (UUID PK)
- name
- slug
- owner_id (FK → users)
- created_at
- updated_at

### workspace_members
- id (UUID PK)
- workspace_id (FK)
- user_id (FK)
- role (owner/admin/member)
- created_at

### data_sources
- id (UUID PK)
- workspace_id (FK)
- source_type (linkedin/gmail/outlook/github/crm/csv/json)
- name
- created_at

### imports
- id (UUID PK)
- workspace_id (FK)
- data_source_id (FK)
- source_type
- source_version
- status (pending/processing/completed/failed)
- uploaded_at
- processing_started_at
- processing_completed_at
- file_count
- record_count
- error_count
- warning_count
- archive_s3_key
- checksum

### import_files
- id (UUID PK)
- import_id (FK)
- filename
- file_type
- record_count
- status (pending/parsed/normalized/failed)
- s3_key
- checksum
- schema_info (JSONB)
- warnings (JSONB)
- errors (JSONB)

### people
- id (UUID PK)
- workspace_id (FK)
- canonical_name
- first_name
- last_name
- headline
- location
- profile_url
- source_type
- source_id
- confidence
- created_at
- updated_at

### person_identifiers
- id (UUID PK)
- person_id (FK)
- identifier_type (email/linkedin_url/external_id/company_name)
- identifier_value
- source_type
- confidence

### person_profiles
- id (UUID PK)
- person_id (FK)
- field_name
- field_value
- source_file
- observed_at

### person_employment
- id (UUID PK)
- person_id (FK)
- company_id (FK nullable)
- company_name
- title
- description
- start_date
- end_date (nullable = current)
- is_current
- source_file
- observed_at

### companies
- id (UUID PK)
- workspace_id (FK)
- canonical_name
- domain
- linkedin_url
- industry
- size
- location
- description
- source_type
- confidence
- created_at
- updated_at

### company_identifiers
- id (UUID PK)
- company_id (FK)
- identifier_type (domain/linkedin_url/external_id)
- identifier_value
- source_type

### connections
- id (UUID PK)
- workspace_id (FK)
- person_id (FK → people)
- connected_at
- source_file
- status (connected/invited/pending)

### connection_events
- id (UUID PK)
- connection_id (FK)
- event_type (sent/accepted/declared)
- event_at
- source_file

### conversations
- id (UUID PK)
- workspace_id (FK)
- title
- started_at
- last_message_at
- message_count
- source_type

### conversation_participants
- id (UUID PK)
- conversation_id (FK)
- person_id (FK)
- joined_at

### messages
- id (UUID PK)
- workspace_id (FK)
- conversation_id (FK)
- sender_id (FK → people)
- content
- sent_at
- direction (inbound/outbound)
- source_file
- has_attachments

### message_attachments
- id (UUID PK)
- message_id (FK)
- filename
- file_type
- s3_key

### activities
- id (UUID PK)
- workspace_id (FK)
- person_id (FK nullable)
- activity_type (post/comment/reaction/share/repost/vote)
- content
- content_url
- created_at
- source_file

### jobs
- id (UUID PK)
- workspace_id (FK)
- company_id (FK nullable)
- company_name
- title
- description
- location
- url
- source_file
- created_at

### job_applications
- id (UUID PK)
- workspace_id (FK)
- job_id (FK)
- applied_at
- status
- source_file

### saved_jobs
- id (UUID PK)
- workspace_id (FK)
- job_id (FK)
- saved_at
- source_file

### skills
- id (UUID PK)
- person_id (FK)
- name
- endorsement_count
- source_file

### education
- id (UUID PK)
- person_id (FK)
- school_name
- degree
- field_of_study
- start_date
- end_date
- source_file

### embeddings
- id (UUID PK)
- workspace_id (FK)
- entity_type (person/message/document)
- entity_id (UUID)
- embedding (vector 1536)
- model
- created_at

### insights
- id (UUID PK)
- workspace_id (FK)
- type
- title
- explanation
- confidence
- supporting_metrics (JSONB)
- source_records (JSONB)
- generated_at

### agent_conversations
- id (UUID PK)
- workspace_id (FK)
- user_id (FK)
- title
- created_at
- updated_at

### agent_messages
- id (UUID PK)
- conversation_id (FK)
- role (user/assistant/tool)
- content
- tool_name (nullable)
- tool_input (JSONB nullable)
- tool_output (JSONB nullable)
- created_at
