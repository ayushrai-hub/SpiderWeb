# Implementation Roadmap

## Phase 0: Architecture + Documentation ✅

- [x] Product vision
- [x] PRD
- [x] User personas
- [x] MVP scope
- [x] System architecture
- [x] Data architecture
- [x] Canonical data model
- [x] Knowledge graph design
- [x] Ingestion pipeline
- [x] AI agent architecture
- [x] Analytics engine
- [x] API specification
- [x] Auth/security
- [x] Privacy/governance
- [x] Frontend architecture
- [x] Testing strategy
- [x] Observability
- [x] Deployment
- [x] Threat model
- [x] Future integrations
- [x] Implementation roadmap

## Phase 1: Repository + Infrastructure ✅

- [x] pnpm monorepo init
- [x] Package.json for each package
- [x] TypeScript configs
- [x] Docker Compose (PostgreSQL, Redis)
- [x] ESLint + Prettier config
- [x] Husky + lint-staged pre-commit
- [x] GitHub Actions CI pipeline
- [x] PostgreSQL connection/pooling
- [x] Redis connection
- [x] S3/MinIO client (ready, MinIO image unavailable)
- [x] .env.example + env validation
- [x] Health endpoints (/health, /health/db, /health/redis, /health/storage)
- [x] Graceful shutdown handling
- [x] Integration tests (API, DB, Redis, storage)
- [x] All tests pass, lint passes, typecheck passes, build succeeds
- [ ] ESLint + Prettier config
- [ ] Git hooks (husky + lint-staged)
- [ ] CI pipeline (GitHub Actions)
- Duration: 1-2 days

## Phase 2: Authentication + Workspace ✅

- [x] Supabase client configuration
- [x] Auth middleware (JWT validation + workspace scoping)
- [x] Auth routes (signup, login, logout, verify, reset, refresh)
- [x] Workspace creation on first login
- [x] Workspace membership/role model (owner/admin/member)
- [x] Protected route wrapper (requireRole)
- [x] Error handler (Zod validation, Fastify errors)
- [x] Auth integration tests
- [x] All tests pass, lint passes, typecheck passes, build succeeds

## Phase 3: Database + Canonical Schema ✅

- [x] Drizzle ORM setup
- [x] Schema definition (all tables)
- [x] Migration generation (0000_glamorous_texas_twister.sql)
- [x] RLS policies (in schema.ts)
- [x] Index strategy (in RLS policies)
- [x] Database connection (shared/src/database.ts)
- [x] Database integration tests
- [x] All tests pass, lint passes, typecheck passes, build succeeds
- Duration: 3-5 days

## Phase 4: File Upload + Import System

- [ ] S3/MinIO client setup
- [ ] Upload endpoint (multipart)
- [ ] File validation (type, size)
- [ ] Import job creation
- [ ] BullMQ worker setup
- [ ] Processing status tracking
- [ ] Import list/detail API
- Duration: 3-5 days

## Phase 5: LinkedIn Parser

- [ ] LinkedInExportAdapter class
- [ ] File recognition (52+ file types)
- [ ] CSV parser with tolerance
- [ ] Schema detection per file
- [ ] Raw data storage
- [ ] Import file inventory
- [ ] Synthetic fixture data
- [ ] Parser tests
- Duration: 5-7 days

## Phase 6: Normalization + Entity Resolution

- [ ] LinkedIn → canonical mapping
- [ ] Person entity resolution
- [ ] Company entity resolution
- [ ] Multi-identifier matching
- [ ] Confidence scoring
- [ ] Temporal employment history
- [ ] Normalization tests
- Duration: 5-7 days

## Phase 7: Knowledge Graph

- [ ] Graph edge creation from normalized data
- [ ] Temporal relationships
- [ ] Graph query utilities
- [ ] Graph API endpoints
- [ ] Graph traversal queries
- Duration: 3-5 days

## Phase 8: Analytics

- [ ] Analytics service package
- [ ] Network overview metrics
- [ ] Communication metrics
- [ ] Career metrics
- [ ] Analytics snapshots
- [ ] Analytics API
- Duration: 3-5 days

## Phase 9: Dashboard

- [ ] Layout + navigation
- [ ] Dashboard home page
- [ ] People list (search, filter, sort)
- [ ] Person profile page
- [ ] Company list + profile
- [ ] Import flow UI
- [ ] Loading/error/empty states
- Duration: 5-7 days

## Phase 10: Semantic Indexing

- [ ] pgvector setup
- [ ] Embedding generation (OpenAI)
- [ ] Document chunking
- [ ] Embedding storage
- [ ] Semantic search API
- Duration: 2-3 days

## Phase 11: AI Chat

- [ ] Chat UI (ChatGPT-like)
- [ ] Tool definitions (search_people, etc.)
- [ ] Tool execution engine
- [ ] Workspace-scoped retrieval
- [ ] Evidence synthesis
- [ ] Response format
- [ ] Conversation history
- Duration: 5-7 days

## Total MVP Estimate: 40-55 days

## Dependencies

| Phase | Depends On |
| ----- | ---------- |
| 1     | 0          |
| 2     | 1          |
| 3     | 1          |
| 4     | 2, 3       |
| 5     | 4          |
| 6     | 5          |
| 7     | 6          |
| 8     | 7          |
| 9     | 8          |
| 10    | 3          |
| 11    | 9, 10      |
