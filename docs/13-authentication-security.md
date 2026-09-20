# Authentication & Security

## Authentication Provider

Supabase Auth. JWT-based. Supports email/password, OAuth (Google, GitHub planned).

## Auth Flow

```
User → Supabase Auth → JWT Token → API Gateway → Fastify
  → JWT Validation → workspace_id extraction → Row-level filtering
```

## JWT Claims

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "workspace_id": "workspace-uuid",
  "role": "owner",
  "iat": 1234567890,
  "exp": 1234567890
}
```

## Protected Routes

All `/api/v1/*` routes require valid JWT. Middleware extracts workspace_id and injects into request context.

## Role Model

| Role   | Permissions                                              |
| ------ | -------------------------------------------------------- |
| owner  | Full access. Delete workspace. Manage members.           |
| admin  | Manage data, imports, settings. Cannot delete workspace. |
| member | Read data, create imports, use AI chat.                  |

## Multi-tenancy

Every query filtered by workspace_id. No cross-tenant access possible at application layer.

### Row-Level Security (RLS)

PostgreSQL RLS policies enforce tenant isolation at database level:

```sql
CREATE POLICY workspace_isolation ON people
  USING (workspace_id = current_setting('app.current_workspace_id')::uuid);
```

## Session Management

- Supabase manages sessions
- Refresh tokens rotated
- Concurrent session limit configurable
- Logout invalidates all sessions

## Password Policy

- Minimum 8 characters
- bcrypt hashing (Supabase default)
- Rate-limited login attempts
- Account lockout after 10 failures

## API Security

- CORS configured per environment
- Rate limiting per workspace (100 req/min)
- Request size limits (50MB for uploads)
- Input validation on all endpoints
- SQL injection prevention via parameterized queries
- XSS prevention via output encoding

## Secrets Management

- Environment variables for all secrets
- No secrets in code or logs
- Supabase keys via Supabase dashboard
- S3 credentials via IAM roles
- Redis password via connection string
