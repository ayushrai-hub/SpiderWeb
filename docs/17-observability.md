# Observability

## Structured Logging

All logs JSON. Minimum fields:

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "info",
  "message": "Import processed",
  "requestId": "req-abc-123",
  "workspaceId": "ws-abc-123",
  "userId": "user-abc-123",
  "operation": "import.process",
  "duration": 45000,
  "status": "completed",
  "importId": "imp-abc-123"
}
```

## What to Log

### API Layer

- Request received (method, path, query params)
- Authentication result (success/failure, reason)
- Authorization result (workspace access check)
- Response sent (status code, duration)
- Errors (stack trace, request context)

### Ingestion Pipeline

- File uploaded (size, type, checksum)
- Archive extracted (file count)
- Schema detected (source type, version)
- Parsing started/completed (file, records, warnings)
- Normalization started/completed (records, entities)
- Entity resolution (dedup count, merge decisions)
- Import completed (total duration, records, errors)

### AI Agent

- Conversation started
- Tool called (name, parameters, duration, result size)
- Response generated (tokens used, tools invoked)
- Error occurred (tool, error type)

### Background Jobs

- Job enqueued (queue, job type, payload size)
- Job started (worker, attempt)
- Job completed (duration, result)
- Job failed (error, attempt, will retry)

## What NOT to Log

- Message content (privacy)
- Passwords or secrets
- Authentication tokens
- Private identity data (emails, phone numbers) unless redacted
- Raw user data

## Monitoring

### Metrics (Prometheus)

- Request rate, latency, error rate per endpoint
- Import pipeline throughput
- Worker queue depth and processing rate
- AI agent tool call frequency and latency
- Database connection pool utilization
- Redis memory and operation rate

### Tracing

- OpenTelemetry for distributed tracing
- Trace ID propagated through request → worker → response
- Span for each pipeline stage

### Alerting

- Error rate > 1% for 5 minutes
- Import failure rate > 5%
- Worker queue depth > 1000
- API latency p99 > 2 seconds
- Database connection pool > 80%
