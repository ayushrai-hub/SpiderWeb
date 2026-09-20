# Threat Model

## Assets

| Asset                    | Sensitivity | Impact                   |
| ------------------------ | ----------- | ------------------------ |
| User account credentials | Critical    | Account takeover         |
| LinkedIn export data     | High        | Privacy violation        |
| Message content          | High        | Privacy violation        |
| Email addresses          | Medium      | Spam/phishing            |
| Phone numbers            | Medium      | Spam                     |
| Employment history       | Medium      | Privacy                  |
| AI conversations         | Medium      | Privacy                  |
| Analytics data           | Low-Medium  | Competitive intelligence |

## Threat Actors

1. **Malicious user** — tries to access other tenants' data
2. **Compromised account** — attacker with valid credentials
3. **Prompt injection** — user tricks AI agent into unauthorized actions
4. **Supply chain** — compromised dependency

## Mitigations

### Tenant Isolation

- Row-level security on all tables
- workspace_id filtered at application layer AND database level
- JWT contains workspace_id, validated on every request
- No shared global state between tenants

### Authentication

- Supabase Auth manages credentials
- bcrypt password hashing
- Rate-limited login attempts
- JWT expiration and refresh rotation
- Session invalidation on logout

### Authorization

- Role-based access (owner/admin/member)
- Workspace membership verified before data access
- API endpoints validate workspace scope

### Input Validation

- Zod schemas on all API inputs
- Parameterized queries (no string concatenation)
- File type validation on uploads
- Size limits on uploads and requests

### Prompt Injection

- User input sanitized before LLM processing
- Tool outputs sanitized before display
- AI agent cannot execute arbitrary SQL
- Tool parameters validated against schemas
- Workspace isolation enforced in tool execution

### Data Protection

- No sensitive data in logs
- No secrets in code
- S3 bucket policies restrict access
- Database connections encrypted in transit
- Backups encrypted at rest

### Supply Chain

- Dependencies pinned (lockfile)
- Regular dependency audits (npm audit)
- No unnecessary dependencies
- Build reproducibility

## Security Testing

- Static analysis (ESLint security rules)
- Dependency scanning (npm audit)
- Penetration testing (pre-launch)
- RLS policy testing
- Cross-tenant access testing
- Prompt injection testing
