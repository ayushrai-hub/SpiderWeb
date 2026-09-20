# MVP Scope

## In Scope (MVP)

### Phase 0: Architecture + Documentation ✅

- PRD, architecture docs, canonical data model
- Tech stack decisions
- Implementation roadmap

### Phase 1: Repository + Infrastructure

- pnpm monorepo skeleton
- Package structure (apps, packages, workers)
- Base TypeScript config
- Docker Compose for local dev (PostgreSQL, Redis, MinIO)

### Phase 2: Authentication + Workspace

- Supabase Auth integration
- Signup/login/logout/email-verify/password-reset
- Workspace creation on first login
- Role model (owner/admin/member)
- Protected API routes

### Phase 3: Database + Canonical Schema

- PostgreSQL schema with migrations
- All core tables (see canonical-data-model.md)
- Row-level security policies
- Index strategy

### Phase 4: File Upload + Import System

- S3-compatible upload endpoint
- ZIP/CSV/JSON file validation
- Import job creation and tracking
- Processing status pipeline

### Phase 5: LinkedIn Parser

- LinkedInExportAdapter
- CSV schema detection
- 52+ file type recognition
- Tolerant parsing (missing files, empty rows, unknown columns)
- Raw data preservation

### Phase 6: Normalization + Entity Resolution

- LinkedIn → canonical model mapping
- Person entity resolution (multi-identifier)
- Company entity resolution
- Temporal employment history

### Phase 7: Knowledge Graph

- Graph edges from normalized data
- Temporal relationships
- Confidence scoring
- Graph query API

### Phase 8: Analytics

- Network overview metrics
- Communication metrics
- Career metrics
- Analytics API endpoints

### Phase 9: Dashboard

- Network overview cards
- Communication summary
- Career summary
- Activity summary
- People list with search/filter

### Phase 10: Semantic Indexing

- pgvector embeddings
- Document chunking
- Semantic search API

### Phase 11: AI Chat

- Chat UI
- Tool-based retrieval (search_people, search_companies, etc.)
- Graph + vector + SQL retrieval
- Evidence-backed responses

## Out of Scope (Post-MVP)

- Web research agent
- Live enrichment
- Gmail/Outlook integration
- CRM integration
- Team features
- Advanced recommendations
- Mobile app
