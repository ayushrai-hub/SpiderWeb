# Decision Log

## ADR-001: TypeScript Monorepo

**Date:** 2024-01-15
**Status:** Accepted

**Decision:** Use pnpm workspaces with TypeScript across all packages.

**Reasoning:**

- Shared types between frontend and backend
- Single language reduces cognitive load
- pnpm faster and more efficient than npm/yarn
- Monorepo enables code sharing without publishing

**Alternatives considered:**

- Separate repos per service: rejected (type drift, code duplication)
- Turborepo: rejected for MVP (overhead, pnpm workspaces sufficient)
- Nx: rejected (heavier, more config)

---

## ADR-002: Fastify over NestJS

**Date:** 2024-01-15
**Status:** Accepted

**Decision:** Use Fastify for API server.

**Reasoning:**

- Less boilerplate than NestJS
- Better raw performance
- Plugin system sufficient for our needs
- Smaller learning curve

**Alternatives considered:**

- NestJS: rejected (decorators, modules, more opinionated)
- Express: rejected (slower, less modern)
- Hono: considered (good but smaller ecosystem)

---

## ADR-003: Drizzle ORM over Prisma

**Date:** 2024-01-15
**Status:** Accepted

**Decision:** Use Drizzle ORM for database access.

**Reasoning:**

- Thinner abstraction, closer to SQL
- Better migration control
- TypeScript-first without code generation step
- Better performance (no query engine overhead)

**Alternatives considered:**

- Prisma: rejected (heavier, code generation, query engine)
- TypeORM: rejected (older, less TypeScript-native)
- Kysely: considered (good but Drizzle has better schema DSL)

---

## ADR-004: PostgreSQL + pgvector over Separate Vector DB

**Date:** 2024-01-15
**Status:** Accepted

**Decision:** Use PostgreSQL with pgvector extension for both relational and vector data.

**Reasoning:**

- Single database to manage
- No vendor lock-in (Pinecone, Weaviate)
- pgvector sufficient for our scale (< 1M embeddings)
- Transaction support across relational and vector data

**Alternatives considered:**

- Pinecone: rejected (vendor lock-in, additional cost)
- Weaviate: rejected (additional infrastructure)
- Qdrant: considered (good but unnecessary for MVP)

---

## ADR-005: BullMQ over pg-boss

**Date:** 2024-01-15
**Status:** Accepted

**Decision:** Use BullMQ on Redis for background jobs.

**Reasoning:**

- Better Redis ecosystem integration
- Superior retry and rate limiting
- Dashboard UI for monitoring
- Active maintenance

**Alternatives considered:**

- pg-boss: rejected (PostgreSQL-based, less mature)
- Agenda: rejected (MongoDB-based)
- Custom: rejected (reinventing the wheel)

---

## ADR-006: Supabase Auth over Auth.js

**Date:** 2024-01-15
**Status:** Accepted

**Decision:** Use Supabase Auth for authentication.

**Reasoning:**

- Production-ready JWT management
- Built-in row-level security integration
- OAuth provider support
- Managed service (less ops burden)

**Alternatives considered:**

- Auth.js (NextAuth): rejected (more DIY, JWT handling more complex)
- Firebase Auth: rejected (Google lock-in)
- Clerk: considered (good but Supabase RLS integration is unique)

---

## ADR-007: LinkedIn as First Adapter

**Date:** 2024-01-15
**Status:** Accepted

**Decision:** Build LinkedIn export ingestion as first source adapter.

**Reasoning:**

- Richest personal-network data export
- Well-documented CSV format
- Large potential user base
- Validates canonical model design

**Risk:** LinkedIn may change export format. Mitigated by adapter pattern and tolerant parsing.

---

## ADR-008: PostgreSQL Ports for Local Development

**Date:** 2024-01-15
**Status:** Accepted

**Decision:** Map PostgreSQL to port 5433 and Redis to port 6380 in Docker Compose.

**Reasoning:**

- Local development machine already runs PostgreSQL on port 5432
- Avoids port conflicts between local and Docker services
- Redis on 6380 to avoid conflicts with any local Redis

**Alternatives considered:**

- Stop local PostgreSQL: rejected (may break other projects)
- Use different network: rejected (more complex setup)

---

## ADR-009: ESLint Flat Config

**Date:** 2024-01-15
**Status:** Accepted

**Decision:** Use ESLint flat config (eslint.config.js) with typescript-eslint.

**Reasoning:**

- ESLint 9+ uses flat config by default
- typescript-eslint v8 supports flat config natively
- Simpler configuration than legacy .eslintrc
- Better performance with single config file

---

## ADR-010: Husky + lint-staged

**Date:** 2024-01-15
**Status:** Accepted

**Decision:** Use Husky for git hooks and lint-staged for pre-commit checks.

**Reasoning:**

- Industry standard for pre-commit quality checks
- lint-staged runs only on staged files (fast)
- Husky v9 is lightweight and well-maintained
- Catches issues before they reach CI
