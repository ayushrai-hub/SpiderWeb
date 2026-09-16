# Privacy & Data Governance

## Data Ownership

User owns all data in their workspace. Platform is processor, not owner.

## Data Lifecycle

### Collection
- User uploads data voluntarily
- System processes and stores
- Provenance recorded on every fact

### Storage
- Raw files: immutable in S3
- Canonical data: PostgreSQL with soft deletes
- Embeddings: pgvector
- Backups: encrypted, tenant-scoped

### Retention
- User-controlled retention periods
- Default: indefinite until user deletes
- Audit logs: 1 year minimum
- Deleted data: 30-day soft delete, then permanent

### Deletion
- Import deletion: removes normalized data, preserves raw files for 30 days
- Workspace deletion: removes all data including raw files after 30-day grace
- User account deletion: removes all workspaces and data
- Right to erasure: immediate permanent deletion on request

## Data Export

Users can export:
- All canonical data as CSV/JSON
- Raw uploaded files
- AI conversation history
- Analytics data
- Knowledge graph (nodes + edges)

## Audit Logging

All mutations logged:
- user_id
- workspace_id
- action (create/update/delete)
- entity_type
- entity_id
- timestamp
- ip_address (where available)

Audit logs immutable. Never deleted.

## Sensitive Data

### Protected Fields
- Email addresses
- Phone numbers
- Message content
- Authentication secrets
- Access tokens

### Access Controls
- Only owner/admin can view member list
- Message content only visible to conversation participants
- No sensitive data in API logs
- No sensitive data in error messages
- No sensitive data in analytics

## Compliance Considerations

- GDPR: right to access, right to erasure, data portability
- CCPA: right to know, right to delete
- Data minimization: collect only what user provides
- Purpose limitation: data used only for stated product purpose
- Consent: user explicitly consents to data processing on upload

## Data Residency

- User data stored in region selected at workspace creation
- Default: US (us-east-1)
- EU option available
- No cross-region data transfer without user consent
