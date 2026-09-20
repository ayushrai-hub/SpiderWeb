# SpiderWeb Can show on localhost

Turn the data export LinkedIn gives you into a structured, searchable map of
your professional network.

You upload the ZIP LinkedIn emails you. SpiderWeb works out which files it can
use, normalises them into people, companies, roles, schools and conversations,
resolves duplicates, and builds a dashboard, search, filters, company views and
a network graph on top of them.

Every number in the product is a count over rows that came from your export.
Nothing is estimated, sampled or inferred beyond a small set of clearly-labelled
rules (see [Relationship signals](#relationship-signals)).

---

## Contents

- [What it does](#what-it-does)
- [Quick start](#quick-start)
- [Getting your LinkedIn export](#getting-your-linkedin-export)
- [What gets imported](#what-gets-imported)
- [Relationship signals](#relationship-signals)
- [Architecture](#architecture)
- [Data model](#data-model)
- [Environment variables](#environment-variables)
- [Commands](#commands)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security](#security)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)

---

## What it does

| Surface       | What you get                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Dashboard** | Connection count, company and role distribution, growth over time, career moves, relationship signals, and an honest breakdown of which fields your export actually contained. |
| **People**    | Server-side search and filtering by company, title, school, tag and signal, with sorting and pagination. Works the same at 200 connections as at 20,000.                       |
| **Profile**   | Everything the export knows about one person: roles, education, skills, message threads, endorsements, plus your own notes and tags.                                           |
| **Companies** | Who you know at each company, current versus former, common titles, where they studied, and related employers people moved between.                                            |
| **Graph**     | You at the centre, employers and schools as hubs sized by how many people sit behind them. Click a company to expand the people inside it.                                     |
| **Analytics** | Growth, concentration, role distribution and rule-based reconnect suggestions that state why each person surfaced.                                                             |
| **Imports**   | Per-file breakdown of every upload: which datasets were recognised, how many rows were read, imported, updated, deduplicated and rejected, and why anything was skipped.       |
| **Settings**  | Workspace summary, CSV/JSON export of your processed data, analytics recalculation, and a guarded delete-everything.                                                           |

---

## Quick start

```bash
# 1. Dependencies
pnpm install

# 2. Postgres + Redis
docker compose up -d

# 3. Configuration
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local

# 4. Database schema
pnpm db:migrate

# 5. Run it
pnpm dev
```

- Web app: <http://localhost:3000>
- API: <http://localhost:3001>
- Readiness (database, migrations, Redis): <http://localhost:3001/health/ready>

`pnpm dev` runs the API and the web app. Imports are processed in-process by
default, so that is everything you need. To run ingestion on a separate worker,
set `INGESTION_MODE=queue` and also run `pnpm dev:worker`.

---

## Getting your LinkedIn export

1. On LinkedIn: **Me → Settings & Privacy → Data privacy → Get a copy of your data**.
2. Choose **Want something in particular?** and tick at least **Connections**.
   Also ticking Profile, Positions, Education, Skills and Messages unlocks
   considerably more of the product — see the table below.
3. The small archive usually arrives by email within ~10 minutes. The complete
   archive can take up to 24 hours.
4. Upload the `.zip` exactly as LinkedIn sent it, or drop individual CSVs.

---

## What gets imported

Detection is two-stage: filename first, then a column-header signature, so a
renamed or partial archive still works.

| LinkedIn file                                                                                          | Becomes                                       | Unlocks                                                       |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------- |
| `Connections.csv`                                                                                      | People, connections, companies, current roles | Everything. This is the only file that is genuinely required. |
| `Profile.csv`                                                                                          | Your own profile                              | Shared-employer and shared-school signals, message direction  |
| `Positions.csv`                                                                                        | Your employment history                       | Career overlap with your connections                          |
| `Education.csv`                                                                                        | Your education                                | Shared-school signal                                          |
| `Skills.csv`, `Endorsement_Received_Info.csv`                                                          | Your skills, who endorsed them                | Endorsement touchpoints                                       |
| `Email Addresses.csv`, `PhoneNumbers.csv`                                                              | Your contact details                          | Profile completeness                                          |
| `messages.csv`                                                                                         | Conversations and messages                    | Interaction recency, dormant/engaged signals                  |
| `Invitations.csv`                                                                                      | Invitation touchpoints                        | People you invited who are not yet connections                |
| `Recommendations_Received.csv` / `_Given.csv`                                                          | Recommendation touchpoints                    | Relationship context                                          |
| `Company Follows.csv`                                                                                  | Companies you follow                          | Company coverage                                              |
| `Certifications.csv`, `Languages.csv`, `Projects.csv`, `Honors.csv`, `Courses.csv`, `Volunteering.csv` | Your profile detail                           | Profile completeness                                          |
| `Comments.csv`, `Reactions.csv`, `Shares.csv`                                                          | Your activity                                 | Activity history                                              |
| `jobs/Job Applications.csv`, `jobs/Saved Jobs.csv`                                                     | Jobs, with who you know at each company       | Jobs view                                                     |

**Deliberately not imported**, and listed as such on the import page:
`Ads Clicked.csv`, `Ad_Targeting.csv`, `Registration.csv`, `Login History.csv`,
`Security Challenges.csv`, `SearchQueries.csv`, `Inferences_*.csv`,
`Device Information.csv`, `IP Addresses.csv`. These are advertising and security
telemetry with no relationship value, and a network tool has no business
retaining them.

### The import pipeline

```
upload → validate → safe ZIP extraction → dataset detection → CSV parsing
       → normalisation → entity resolution → idempotent upsert
       → derived aggregation → import summary
```

Resilience rules, each covered by a test:

- One malformed row is rejected and counted; the file still imports.
- One unreadable file is marked failed; the import completes as
  `partially_completed` and says which file failed and why.
- Re-importing the same archive updates rows in place. It never duplicates and
  never inflates a counter.
- Your notes and tags are never read or written by the import pipeline.

---

## Relationship signals

Signals are deterministic functions of imported facts. There is no scoring
model. Each is labelled in the UI as an **observed fact** (LinkedIn told us) or
a **calculated signal** (derived by the stated rule).

| Signal               | Kind       | Rule                                                                   |
| -------------------- | ---------- | ---------------------------------------------------------------------- |
| Recently connected   | calculated | Connected within the last 90 days                                      |
| Long-standing        | calculated | Connected more than 5 years ago                                        |
| Dormant              | calculated | Connected over 2 years ago, no message or endorsement in the last year |
| Engaged              | observed   | You have exchanged messages or endorsements                            |
| Changed company      | observed   | A later import showed a different current employer                     |
| Shared employer      | observed   | Worked at a company you have also worked at                            |
| Shared school        | observed   | Attended a school you also attended                                    |
| No employer recorded | observed   | The export listed no company for this person                           |

SpiderWeb deliberately does **not** claim to know relationship strength,
response rates or meeting conversion. A LinkedIn export contains nothing that
supports those claims.

---

## Architecture

```
apps/web         Next.js 14 (App Router), TanStack Query, Tailwind, Recharts
apps/api         Fastify 5 — REST, upload handling, all SQL
packages/ingestion   Parsing, normalisation, persistence, derived analytics
packages/database    Drizzle schema + SQL migrations + migration runner
packages/shared      Env validation, database and Redis clients
workers/ingestion-worker   Optional BullMQ consumer for INGESTION_MODE=queue
tests/           Unit, integration and Playwright end-to-end suites
```

Notable decisions, and why:

- **Ingestion runs in-process by default.** A queue is the right answer at
  scale, but requiring a second process to make uploads work at all meant the
  product appeared broken on a fresh clone. `INGESTION_MODE=queue` restores the
  worker; both paths call the same `runImport`, so behaviour is identical.
- **All data access is parameterised SQL** through one `query()` / `getSql()`
  helper. An earlier Supabase-client abstraction silently swallowed writes when
  its credentials were absent, which is worse than failing.
- **Derived values are stored, not computed at read time.** Company counts,
  current roles and interaction recency are recomputed after every import, so
  the dashboard is a set of indexed lookups.
- **The graph is aggregated.** One node per connection is unreadable and slow;
  the overview is a hub graph and individual people appear only on drill-down.
- **Hand-written SQL migrations** are the source of truth. The drizzle-kit
  journal had drifted from the database, silently skipping migrations, so the
  runner now reads the migrations directory itself.

---

## Data model

Core tables, all scoped by `workspace_id` with `ON DELETE CASCADE`:

| Table                                            | Purpose                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `people`                                         | One row per human. `dedupe_key` is a deterministic identity (profile URL → email → name+company), unique per workspace, which is what makes re-import idempotent. Current company/title/location are denormalised here so list filters stay indexable, and a generated `search_document` tsvector backs ranked search. |
| `person_employment`                              | Role history. Rows from `Connections.csv` are point-in-time snapshots; only the latest stays `is_current`, which is how a job change becomes visible across imports.                                                                                                                                                   |
| `companies`                                      | Deduplicated by a normalised name that ignores legal suffixes, so "Acme", "Acme Corp" and "Acme, Inc." are one company. Carries maintained connection/current/former counters.                                                                                                                                         |
| `connections`                                    | The relationship itself, unique per (workspace, person).                                                                                                                                                                                                                                                               |
| `education`, `skills`, `emails`, `phone_numbers` | Per-person detail, each with a uniqueness rule so repeat imports do not duplicate.                                                                                                                                                                                                                                     |
| `conversations`, `messages`                      | Message threads, linked to a person by profile URL or an unambiguous name match.                                                                                                                                                                                                                                       |
| `person_interactions`                            | Endorsement, recommendation and invitation touchpoints, stored rather than counted inline so re-import cannot inflate them.                                                                                                                                                                                            |
| `person_notes`, `tags`, `person_tags`            | Yours. Never touched by an import.                                                                                                                                                                                                                                                                                     |
| `imports`, `import_files`                        | Full per-file audit of every upload.                                                                                                                                                                                                                                                                                   |
| `audit_logs`                                     | Destructive and sensitive operations.                                                                                                                                                                                                                                                                                  |

Indexes: GIN trigram on names and companies for fuzzy search, a GIN index on
the tsvector for ranked search, and btree indexes on every filterable column.

---

## Environment variables

See [`.env.example`](.env.example) for the annotated list. Summary:

| Variable              | Required         | Default                  | Notes                              |
| --------------------- | ---------------- | ------------------------ | ---------------------------------- |
| `DATABASE_URL`        | yes              | —                        | Boot fails immediately without it  |
| `INGESTION_MODE`      | no               | `inline`                 | `inline` or `queue`                |
| `REDIS_URL`           | only for `queue` | —                        | Also enables shared rate limiting  |
| `UPLOAD_DIR`          | no               | `/tmp/spiderweb-uploads` | Cleared after each import          |
| `TEMP_DIR`            | no               | `/tmp/spiderweb-extract` | Cleared after each import          |
| `KEEP_RAW_UPLOADS`    | no               | `false`                  | Debugging only                     |
| `PORT`, `HOST`        | no               | `3001`, `0.0.0.0`        | API                                |
| `LOG_LEVEL`           | no               | `info`                   |                                    |
| `CORS_ORIGIN`         | no               | `http://localhost:3000`  | Comma-separated                    |
| `NEXT_PUBLIC_API_URL` | yes (web)        | `http://localhost:3001`  | Must live in `apps/web/.env.local` |

---

## Commands

```bash
pnpm dev               # API + web app
pnpm dev:worker        # Ingestion worker (only for INGESTION_MODE=queue)
pnpm build             # Production build: bundled API/worker + Next.js
pnpm db:migrate        # Apply pending SQL migrations
pnpm typecheck         # TypeScript across every package
pnpm lint              # ESLint
pnpm test              # Unit + integration (needs Postgres)
pnpm test:integration  # Integration only
pnpm test:e2e          # Playwright end-to-end (starts the app if needed)
```

---

## Testing

| Suite                  | Location                                    | Covers                                                                                                                                    |
| ---------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                   | `tests/unit/`                               | Normalisation primitives, CSV parsing, dataset detection, ZIP extraction safety                                                           |
| Integration — pipeline | `tests/integration/import-pipeline.test.ts` | Import into a real database: idempotency, incremental imports, career moves, workspace isolation, 2,000-connection performance            |
| Integration — HTTP     | `tests/integration/api.test.ts`             | Every endpoint through the real Fastify stack, including upload validation and empty states                                               |
| Integration — security | `tests/integration/security.test.ts`        | Cross-workspace access, SQL injection attempts, zip-slip, filename spoofing, CSV formula injection, rate limiting, error-response hygiene |
| End-to-end             | `tests/e2e/`                                | The full browser journey and a mobile viewport pass                                                                                       |

Integration tests create and migrate their own `spiderweb_test` database
(override with `TEST_DATABASE_URL`), so running them never touches your own
imported data. The Playwright suite does clear the development workspace —
point it at a scratch environment if that matters.

```bash
docker compose up -d
pnpm test         # 154 unit + integration tests
pnpm test:e2e     # 38 browser tests (desktop + mobile)
```

---

## Deployment

`pnpm build` produces:

- `apps/api/dist/index.js` — a self-contained ESM bundle; workspace packages are
  inlined, `node_modules` dependencies stay external
- `workers/ingestion-worker/dist/index.js` — same, for queue mode
- `apps/web/.next` — the standard Next.js production build

Run order:

```bash
pnpm install --prod --frozen-lockfile
pnpm db:migrate            # always before starting the API
node apps/api/dist/index.js
pnpm --filter @intel/web start
```

The API refuses to start if the database is unreachable or the schema is out of
date, and `/health/ready` reports the state of each dependency for a load
balancer or orchestrator.

Dockerfiles for the API and web app are in `apps/*/Dockerfile`.

---

## Security

- **Workspace isolation.** Every query is scoped by `workspace_id`. No
  client-supplied header can change which workspace is read; tests assert this.
- **Upload handling.** Filenames are reduced to a sanitised basename and never
  used as a path. Extension and size are validated on the way in; the ZIP magic
  bytes are checked before extraction.
- **ZIP extraction.** Absolute paths, `..` traversal and entries that resolve
  outside the extraction directory are refused. Per-entry, total-size,
  entry-count, depth and path-length limits stop decompression bombs. Nested
  archives are never recursed into and nothing is ever executed.
- **SQL.** Everything is parameterised. Only compile-time constants ever reach
  the SQL text; sort columns and filters are validated against allow-lists.
- **CSV exports** are quoted per RFC 4180 and prefixed to neutralise spreadsheet
  formula injection.
- **Errors.** Unexpected failures are logged server-side with their stack and
  returned to the client as a generic message with a machine-readable code.
- **Logging.** Authorization and cookie headers are redacted. Import logs carry
  identifiers and counts only — never record contents, emails or message text.
- **Destructive actions** require explicit confirmation and are recorded in
  `audit_logs`.
- **Raw uploads are deleted** once parsed, unless `KEEP_RAW_UPLOADS=true`.

### Authentication

**This build has no sign-in.** It runs as a single local operator whose user and
workspace are seeded on first request. This was explicitly out of scope for this
piece of work.

Everything downstream already goes through `request.user.workspaceId`, and every
query is scoped by it, so adding real authentication means replacing one
function — `resolveIdentity()` in `apps/api/src/middleware/auth.ts` — with a
token verifier that returns the same `AuthUser`. `requireRole()` is already
applied to privileged routes. Do not expose this build on a public network as-is.

---

## Known limitations

These are properties of the LinkedIn export, not bugs:

- **`Connections.csv` has no location or industry column.** It contains only
  first name, last name, profile URL, email address, company, position and
  connection date. Location and industry are therefore only known for your own
  profile, and the corresponding breakdowns stay empty and say so rather than
  showing invented data.
- **Email addresses are mostly absent.** LinkedIn only includes them for
  connections who opted in.
- **Job changes are only visible across two imports.** A single export is one
  snapshot; the "changed company" signal appears once a newer export shows a
  different employer.
- **Messages require the complete archive.** The small export does not include
  `messages.csv`, so interaction signals will be empty without it.
- **Connection dates have day precision** and no time zone.

---

## Troubleshooting

| Symptom                                                                      | Cause and fix                                                                                                                                   |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| API exits with `Cannot connect to the database`                              | Postgres is not running. `docker compose up -d`.                                                                                                |
| API exits with `The database schema is out of date`                          | Run `pnpm db:migrate`.                                                                                                                          |
| `/health/ready` returns 503                                                  | The response body names the failing check.                                                                                                      |
| Upload rejected: "not supported"                                             | Only `.zip`, `.csv`, `.tsv` and `.txt` are accepted.                                                                                            |
| Import failed: `NO_LINKEDIN_DATA`                                            | Nothing in the upload matched a known dataset. Check it is the archive LinkedIn sent, not a folder you assembled.                               |
| Import failed: `INVALID_ARCHIVE`                                             | The file is not a ZIP. Re-download it; some mail clients rewrite attachments.                                                                   |
| Import `partially_completed`                                                 | Some files could not be read. The import detail page lists which and why.                                                                       |
| Import stuck on "Queued"                                                     | `INGESTION_MODE=queue` without a running worker. Start `pnpm dev:worker`, or switch to `inline`.                                                |
| Dashboard empty after a successful import                                    | Open the import detail page — it shows how many rows each file contributed.                                                                     |
| `429 Too many requests` on upload                                            | 20 uploads per 10 minutes per user. Wait, or raise the limit in `apps/api/src/middleware/rate-limit.ts`.                                        |
| Web app cannot reach the API                                                 | `NEXT_PUBLIC_API_URL` must be set in `apps/web/.env.local`; Next.js does not read the root `.env`.                                              |
| Pages render but nothing is interactive, and `/_next/static/...` returns 404 | `pnpm build` was run while `pnpm dev` was running; both use `apps/web/.next`. Stop the dev server, delete `apps/web/.next`, and start it again. |

---

## Design documents

`docs/00-*` to `docs/22-*` are the original product and architecture design
documents. They describe the intended long-term system, including features this
build does not implement (AI assistant, enrichment, vector search). Treat this
README and the code as the record of what actually exists.
