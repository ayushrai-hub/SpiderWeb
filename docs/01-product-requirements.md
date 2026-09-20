# Product Requirements

## Core Requirements

### R1: Multi-tenant Data Import

- User uploads LinkedIn ZIP export
- System validates, extracts, inventories files
- Schema detection identifies source type
- Parser normalizes into canonical model
- Entity resolution deduplicates people/companies
- Knowledge graph constructed
- Embeddings generated
- Analytics computed

### R2: Canonical Data Model

- Source-agnostic schema (not LinkedIn-coupled)
- Temporal fields for employment, relationships
- Provenance tracking (source, confidence, timestamp)
- Multi-identifier support for people/companies
- Raw data preservation (immutable originals)

### R3: Knowledge Graph

- Person ↔ Company ↔ Job relationships
- Communication graph (messages, conversations)
- Activity graph (posts, comments, reactions)
- Temporal edges with valid_from/valid_until
- Confidence scoring on all edges

### R4: Analytics Engine

- Network overview (connections, companies, industries)
- Communication metrics (volume, response rate, patterns)
- Outbound intelligence (reach-out count, follow-ups)
- Career metrics (applications, saved jobs, target companies)
- Relationship intelligence (active, dormant, frequent contacts)

### R5: AI Agent

- Natural-language query interface
- Tool-based data retrieval (not raw SQL)
- Graph traversal queries
- Semantic/vector search
- Optional web research enrichment
- Evidence-backed responses with provenance

### R6: Authentication & Authorization

- Signup, login, logout, email verification, password reset
- Workspace creation and membership
- Role model: owner, admin, member
- Row-level tenant isolation
- No cross-tenant data access

### R7: Privacy & Governance

- Data deletion (import, workspace, user)
- User data export
- Audit logging
- Source provenance on all facts
- No silent data mixing (private vs public vs inferred)

## Non-Functional Requirements

### NFR1: Type Safety

TypeScript throughout. Strict mode. Shared types between frontend/backend.

### NFR2: Observability

Structured logging. Request tracing. Error tracking. No sensitive data in logs.

### NFR3: Testability

Unit, integration, API, database, ingestion, entity-resolution, analytics, agent-tool, authorization, security, frontend, E2E tests.

### NFR4: Deployability

CI/CD pipeline. Containerized services. Managed PostgreSQL. Managed Redis. Object storage.

### NFR5: Idempotency

Imports are idempotent. Processing is resumable. Deletion is reliable.
