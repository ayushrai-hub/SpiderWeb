# Deployment

## Environments

| Environment | Purpose | Infrastructure |
|-------------|---------|---------------|
| local | Development | Docker Compose |
| staging | Pre-production | Managed services |
| production | Live | Managed services |

## Local Development

```yaml
# docker-compose.yml
services:
  postgres:
    image: pgvector/pgvector:pg16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: intel_dev
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  minio:
    image: minio/minio
    ports: ["9000:9000", "9001:9001"]
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
```

## Production Infrastructure

### Frontend (Vercel)
- Next.js app
- Automatic deployments from main
- Preview deployments for PRs

### API (Railway / Fly.io / ECS)
- Fastify server
- Horizontal scaling
- Health checks

### Workers (Same as API or separate)
- BullMQ workers
- Auto-scaling based on queue depth

### Database (Neon / Supabase)
- PostgreSQL 16 with pgvector
- Automated backups
- Point-in-time recovery

### Object Storage (S3)
- Raw file storage
- Lifecycle policies for cost optimization

### Redis (Upstash / Redis Cloud)
- BullMQ job queues
- Session cache
- Rate limiting

## CI/CD

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]

jobs:
  test:
    - lint
    - typecheck
    - unit tests
    - integration tests
    - e2e tests

  deploy:
    needs: test
    - deploy frontend to Vercel
    - deploy API to Railway
    - deploy workers to Railway
    - run migrations
```

## Database Migrations

```bash
pnpm db:generate   # Generate migration from schema changes
pnpm db:migrate    # Apply pending migrations
pnpm db:seed       # Load test data
```

## Environment Variables

```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
S3_BUCKET=...
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...       # For embeddings
```
