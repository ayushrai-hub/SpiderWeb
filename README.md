# Professional Intelligence Platform

A multi-tenant Personal Relationship & Professional Intelligence Platform that imports LinkedIn data, normalizes it, builds a knowledge graph, provides analytics, and offers an AI agent for querying your professional network.

## Features

- **LinkedIn Data Import**: Upload and process LinkedIn data exports
- **Knowledge Graph**: Build relationships between people, companies, and activities
- **Analytics**: Network analysis, communication patterns, career insights
- **AI Assistant**: Query your professional network using natural language
- **Multi-tenant**: Workspace-based isolation with role-based access control
- **Secure**: Encrypted API key storage, rate limiting, audit logging

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│     API     │────▶│  Database   │
│  (Next.js)  │     │  (Fastify)  │     │ (PostgreSQL)│
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Workers   │
                    │  (BullMQ)   │
                    └─────────────┘
```

## Prerequisites

- Node.js 18+
- pnpm 8+
- PostgreSQL 14+ with pgvector extension
- Redis 6+
- Docker (optional)

## Quick Start

### 1. Clone and install

```bash
git clone <repository-url>
cd intel-platform
pnpm install
```

### 2. Start infrastructure

```bash
docker compose up -d
```

### 3. Set up environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 4. Run migrations

```bash
cd packages/database
npx drizzle-kit migrate
```

### 5. Start development

```bash
pnpm dev
```

The API will be available at `http://localhost:3001` and the web app at `http://localhost:3000`.

## Project Structure

```
intel-platform/
├── apps/
│   ├── api/          # Fastify API server
│   └── web/          # Next.js frontend
├── packages/
│   ├── ai/           # LLM provider gateway
│   ├── database/     # Drizzle ORM schema
│   ├── ingestion/    # Data processing pipeline
│   ├── shared/       # Shared utilities
│   └── types/        # TypeScript types
├── workers/
│   ├── analytics-worker/
│   ├── embedding-worker/
│   ├── enrichment-worker/
│   └── ingestion-worker/
├── tests/
│   ├── e2e/          # Playwright tests
│   ├── fixtures/     # Test data
│   └── unit/         # Unit tests
└── docs/             # Documentation
```

## Development

### Commands

```bash
pnpm dev          # Start all services in development mode
pnpm build        # Build all packages
pnpm test         # Run unit tests
pnpm lint         # Run linting
pnpm typecheck    # Run type checking
```

### Testing

```bash
# Unit tests
pnpm test

# Integration tests (requires running infrastructure)
cd apps/api
DATABASE_URL="postgresql://dev:dev@127.0.0.1:5433/intel_dev" REDIS_URL="redis://127.0.0.1:6380" vitest run

# E2E tests (requires running application)
pnpm test:e2e
```

### Docker

```bash
# Build images
docker compose -f docker-compose.prod.yml build

# Start services
docker compose -f docker-compose.prod.yml up -d
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/signup` - Create account
- `POST /api/v1/auth/login` - Sign in
- `POST /api/v1/auth/logout` - Sign out

### Data
- `GET /api/v1/people` - List people
- `GET /api/v1/companies` - List companies
- `GET /api/v1/messages` - List messages
- `GET /api/v1/conversations` - List conversations

### AI
- `POST /api/v1/ai/chat` - Chat with AI assistant
- `GET /api/v1/ai/tools` - List available tools

### Analytics
- `GET /api/v1/analytics/network` - Network analytics
- `GET /api/v1/analytics/communication` - Communication analytics
- `GET /api/v1/analytics/career` - Career analytics

### Imports
- `POST /api/v1/imports/upload` - Upload LinkedIn ZIP
- `GET /api/v1/imports` - List imports

## Environment Variables

See `.env.example` for all required environment variables.

### Required
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `CREDENTIAL_ENCRYPTION_KEY` - Encryption key for API keys (64 char hex)

### Optional
- `S3_ENDPOINT` - S3-compatible storage endpoint
- `S3_ACCESS_KEY` - S3 access key
- `S3_SECRET_KEY` - S3 secret key

## Security

- All API keys are encrypted at rest using AES-256-GCM
- Row-level security ensures workspace isolation
- Rate limiting prevents abuse
- Audit logging tracks sensitive operations
- CORS configured for production use

## License

Private - All rights reserved.
