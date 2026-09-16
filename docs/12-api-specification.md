# API Specification

## Base URL

```
/api/v1
```

## Authentication

All endpoints require Bearer token (JWT from Supabase Auth).

```
Authorization: Bearer <token>
```

## Endpoints

### Imports

```
POST   /api/v1/imports              — Create import (upload file)
GET    /api/v1/imports              — List imports
GET    /api/v1/imports/:id          — Get import details
POST   /api/v1/imports/:id/process  — Trigger processing
DELETE /api/v1/imports/:id          — Delete import
```

### People

```
GET    /api/v1/people               — List people (search, filter, sort)
GET    /api/v1/people/:id           — Get person details
GET    /api/v1/people/:id/connections — Get person's connections
GET    /api/v1/people/:id/messages  — Get messages with person
GET    /api/v1/people/:id/employment — Get employment history
```

### Companies

```
GET    /api/v1/companies            — List companies
GET    /api/v1/companies/:id        — Get company details
GET    /api/v1/companies/:id/people — Get people at company
```

### Connections

```
GET    /api/v1/connections          — List connections
GET    /api/v1/connections/:id      — Get connection details
```

### Messages

```
GET    /api/v1/messages             — List messages
GET    /api/v1/messages/:id         — Get message details
GET    /api/v1/conversations        — List conversations
GET    /api/v1/conversations/:id    — Get conversation + messages
```

### Jobs

```
GET    /api/v1/jobs                 — List jobs
GET    /api/v1/jobs/:id             — Get job details
GET    /api/v1/applications         — List job applications
GET    /api/v1/saved-jobs           — List saved jobs
```

### Analytics

```
GET    /api/v1/analytics/overview    — Network overview
GET    /api/v1/analytics/network     — Network metrics
GET    /api/v1/analytics/outbound    — Outbound metrics
GET    /api/v1/analytics/career      — Career metrics
GET    /api/v1/analytics/relationships — Relationship metrics
GET    /api/v1/analytics/trends      — Time-series data
```

### Insights

```
GET    /api/v1/insights             — List insights
GET    /api/v1/insights/:id         — Get insight details
```

### AI Agent

```
POST   /api/v1/agent/chat           — Send message to AI assistant
GET    /api/v1/agent/conversations  — List chat conversations
GET    /api/v1/agent/conversations/:id — Get conversation messages
```

### Research (Post-MVP)

```
POST   /api/v1/research             — Start research task
GET    /api/v1/research/:id         — Get research results
```

### Settings

```
GET    /api/v1/settings             — Get workspace settings
PUT    /api/v1/settings             — Update workspace settings
GET    /api/v1/settings/members     — List workspace members
POST   /api/v1/settings/members     — Invite member
DELETE /api/v1/settings/members/:id — Remove member
```

## Response Format

```json
{
  "data": {},
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

## Error Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [...]
  }
}
```
