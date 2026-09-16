# Deployment Guide

## Prerequisites

- Node.js 18+
- pnpm 8+
- PostgreSQL 14+ with pgvector extension
- Redis 6+
- S3-compatible storage (AWS S3, MinIO, or Cloudflare R2)

## Environment Variables

Required for production:

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/intel_prod

# Redis
REDIS_URL=redis://host:6379

# S3 Storage
S3_BUCKET=intel-uploads
S3_ENDPOINT=https://your-s3-endpoint
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
S3_REGION=us-east-1

# Supabase Auth
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Security
CREDENTIAL_ENCRYPTION_KEY=your-64-char-hex-key

# CORS
CORS_ORIGIN=https://your-frontend-domain.com
```

## Generate Encryption Key

```bash
openssl rand -hex 32
```

## Build

```bash
pnpm install
pnpm build
```

## Database Setup

```bash
# Run migrations
cd packages/database
npx drizzle-kit migrate

# Seed data (optional)
pnpm seed
```

## Start Services

```bash
# API Server
cd apps/api
pnpm start

# Frontend
cd apps/web
pnpm start

# Workers (optional)
cd workers/ingestion-worker
pnpm start

cd workers/embedding-worker
pnpm start

cd workers/analytics-worker
pnpm start
```

## Docker

```bash
docker compose -f docker-compose.prod.yml up -d
```

## Health Check

```bash
curl http://localhost:3001/api/v1/health
```

## Production Considerations

1. **SSL/TLS**: Use HTTPS for all endpoints
2. **Rate Limiting**: Adjust limits based on expected traffic
3. **Monitoring**: Set up Prometheus/Grafana for metrics
4. **Logging**: Configure log aggregation (ELK, Datadog)
5. **Backups**: Schedule regular database backups
6. **CDN**: Use CDN for frontend static assets
7. **Workers**: Run workers on separate machines for scaling
