# Analytics Engine

## Principles

- Separate package, not frontend logic
- Reusable services queryable via API
- Deterministic calculations (no LLM for metrics)
- Temporal: metrics computed over time windows
- Cached: precomputed snapshots for dashboard speed

## Analytics Services

### Network Overview

```typescript
getNetworkOverview(workspaceId, timeRange?) → {
  totalConnections: number
  newConnections: number
  companies: number
  industries: Distribution
  roles: Distribution
  locations: Distribution
}
```

### Communication Metrics

```typescript
getCommunicationMetrics(workspaceId, timeRange?) → {
  totalConversations: number
  totalMessages: number
  outboundMessages: number
  inboundMessages: number
  responseRate: number
  avgResponseTime: number
  activeConversations: number
  dormantConversations: number
  unansweredConversations: number
}
```

### Outbound Metrics

```typescript
getOutboundMetrics(workspaceId, timeRange?) → {
  outreachCount: number
  uniquePeopleContacted: number
  uniqueCompaniesContacted: number
  conversationsStarted: number
  responses: number
  responseRate: number
  followUps: number
  followUpRate: number
  unansweredOutreach: number
  avgTimeToResponse: number
}
```

### Career Metrics

```typescript
getCareerMetrics(workspaceId, timeRange?) → {
  applications: number
  savedJobs: number
  targetCompanies: string[]
  recentActivity: ActivitySummary
}
```

### Relationship Metrics

```typescript
getRelationshipMetrics(workspaceId) → {
  activeRelationships: RelationshipSummary
  dormantRelationships: RelationshipSummary
  frequentlyContacted: PersonSummary[]
  newConnections: PersonSummary[]
}
```

## Analytics Snapshots

Precomputed daily snapshots stored in `analytics_snapshots` table. Dashboard reads snapshots, not live queries.

```sql
INSERT INTO analytics_snapshots (workspace_id, snapshot_date, metric_type, metric_data)
VALUES (:workspace_id, CURRENT_DATE, 'network_overview', :json_data);
```

## API Endpoints

```
GET /api/v1/analytics/overview
GET /api/v1/analytics/network
GET /api/v1/analytics/outbound
GET /api/v1/analytics/career
GET /api/v1/analytics/relationships
GET /api/v1/analytics/trends
```
