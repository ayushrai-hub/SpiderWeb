# System Architecture

## Tech Stack Decision

### Frontend

- **Next.js 14+** (App Router) — SSR, API routes, file-based routing
- **TypeScript** — end-to-end type safety
- **Tailwind CSS** — utility-first styling
- **TanStack Query** — server state management
- **Recharts** — charting library
- **shadcn/ui** — component library (copy-paste, not dependency-locked)

### Backend

- **Node.js + Fastify** — high-performance HTTP, good plugin system
- **TypeScript** — shared types with frontend
- **Drizzle ORM** — type-safe SQL, migration-friendly, thin abstraction

### Database

- **PostgreSQL 16** — relational + JSONB + full-text search
- **pgvector** — vector embeddings for semantic search
- **Drizzle Migrations** — schema versioning

### Object Storage

- **MinIO** (dev) / **S3** (prod) — raw file preservation

### Background Jobs

- **BullMQ** on **Redis** — job queues, retries, rate limiting

### Authentication

- **Supabase Auth** — production-grade auth, JWT, row-level security support

### Deployment

- **Vercel** — Next.js frontend
- **Railway / Fly.io / AWS ECS** — Fastify API + workers
- **Neon / Supabase** — managed PostgreSQL
- **Upstash / Redis Cloud** — managed Redis

### Why This Stack

- TypeScript everywhere = shared types, one language
- Fastify > NestJS: less boilerplate, better raw performance
- Drizzle > Prisma: thinner, SQL-close, better migration control
- pgvector over Pinecone: avoid vendor lock-in, keep data in one DB
- BullMQ > pg-boss: better Redis ecosystem, retry, rate limiting
- Supabase Auth > Auth.js: JWT + RLS integration, production-ready

## Service Architecture

```
┌─────────────────────────────────────────────────────┐
│                    CLIENTS                          │
│              Next.js Frontend                       │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────┐
│                   API GATEWAY                       │
│              Fastify + Auth Middleware               │
│         (JWT validation + workspace scoping)        │
└──────┬───────────────┬──────────────┬──────────────┘
       │               │              │
┌──────▼──────┐ ┌──────▼──────┐ ┌─────▼──────┐
│  REST API   │ │  WebSocket  │ │  Worker    │
│  (CRUD)     │ │  (Chat)     │ │  Queues    │
└──────┬──────┘ └──────┬──────┘ └─────┬──────┘
       │               │              │
┌──────▼───────────────▼──────────────▼──────────────┐
│                  DATA LAYER                         │
│  PostgreSQL + pgvector │ Redis │ S3/MinIO          │
└────────────────────────────────────────────────────┘
```

## Worker Architecture

```
┌──────────────────────────────────────────────────┐
│                  BullMQ Queues                   │
├──────────────┬───────────────┬───────────────────┤
│  ingestion   │  enrichment   │  analytics        │
│  queue       │  queue        │  queue            │
├──────────────┼───────────────┼───────────────────┤
│  ingestion   │  enrichment   │  analytics        │
│  worker      │  worker       │  worker           │
├──────────────┴───────────────┴───────────────────┤
│  embedding queue → embedding worker              │
└──────────────────────────────────────────────────┘
```

## Data Flow

```
Upload → S3 → Ingestion Queue → Ingestion Worker
  → Schema Detection → Source Adapter → Parser
  → Normalization → Entity Resolution → DB Insert
  → Graph Update Queue → Analytics Queue
  → Embedding Queue → Complete
```
