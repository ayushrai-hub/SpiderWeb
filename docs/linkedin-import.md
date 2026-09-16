# LinkedIn Data Import Pipeline

## Architecture

```
Browser (drag & drop / file picker / folder picker)
  ↓ multipart upload (XHR with progress)
Fastify API  POST /api/v1/imports/upload
  ↓ streams to UPLOAD_DIR/<importId>/, validates each file, creates import + import_files rows
BullMQ queue "ingestion"
  ↓
Ingestion Worker
  ├─ extractArchive()   — safe streaming ZIP extraction (fflate)
  ├─ classifyFile()     — filename/content-based classification with reasons
  ├─ parseExtractedFiles() — per-type CSV parsing (UTF-8/UTF-16, BOM, quoting)
  ├─ normalizeData()    — canonical entities, deterministic dedup
  └─ persistNormalizedData() — parameterized SQL inserts
  ↓
PostgreSQL (people, companies, connections, messages, employment, education, skills)
  ↓
Knowledge graph / analytics / AI retrieval
```

The import job runs independently of the HTTP request. The frontend polls
`GET /api/v1/imports/:importId` every 2s until terminal status, so processing
survives page refreshes and browser closes.

## Supported uploads

| Input | How | Notes |
|---|---|---|
| ZIP archive | drop, picker, "Upload LinkedIn data" | primary path |
| Multiple files | picker `multiple`, drag & drop | up to 200 files |
| Folder | picker with `webkitdirectory`, folder drag-drop | Chrome/Edge/Safari/Firefox |
| Individual CSV | picker, drag & drop | must match a known LinkedIn filename |

Limits: 500MB per file, 200 files, 750MB total per upload (all enforced client-
and server-side).

## File classification

Every file is classified with `filename / extension / size / category / parser /
status / reason`. Statuses: `supported`, `optional` (unrecognized CSV/JSON —
stored for review), `skipped` (media, junk, nested archives, unknown). Unknown
files never crash the import; counts and reasons surface in the import status
page and API.

Supported LinkedIn files (32 adapters): Connections, Messages, Profile,
Profile Summary, Positions, Education, Skills, Certifications, Projects,
Languages, Honors & Awards, Volunteer Experience, Email Addresses, Phone
Numbers, Invitations, Notes, Comments, Reactions, Shares, Reposts, Job
Applications, Saved Jobs, Job Alerts, Company Follows, Hashtag Follows, Causes
You Care About, Events, Ad Targeting, Ad Clicks, Registration, Login History,
Security Challenges.

Fully normalized today: Connections, Messages, Profile, Positions, Education,
Skills, Job Applications, Saved Jobs, Comments, Reactions, Shares, Reposts.
Other recognized files are parsed and counted but not yet mapped to entities.

## Deduplication

Deterministic keys, in priority order: LinkedIn profile URL (query-stripped,
case-insensitive) → email → name + company (both required — never name alone).
Duplicate connections/messages are skipped. Provenance (`source_file`,
`person_identifiers`, `import_files`) is retained.

## Extraction security

- ZIP magic-byte validation before processing
- Zip Slip: absolute paths, `..` segments, drive letters, overlong paths and
  >12-level nesting rejected; every written path is verified inside
  `TEMP_DIR/import-<id>/extracted/`
- Archive-bomb limits: 512MB per entry, 1.5GB total decompressed, 5000 entries
- Malformed/truncated archives fail with a typed error, never partial writes
- Extracted files are never executed; only CSV/JSON text is parsed
- Temp extraction dir removed after success AND failure

## Privacy

- Raw uploads are deleted after processing (`KEEP_RAW_UPLOADS=false` default)
- Delete import (owner) removes DB rows and residual files
- Logs contain identifiers and counts only (`import_id`, `stage`, `error_code`)
  — never message content, emails, or raw export rows
- The AI layer reads normalized entities via retrieval, never raw archives

## Error codes

| Code | Meaning | User guidance |
|---|---|---|
| `NO_VALID_FILES` | nothing valid in upload | listed reasons per file |
| `TOTAL_SIZE_EXCEEDED` | >750MB total | split the upload |
| `INVALID_ARCHIVE` | not a ZIP | re-export from LinkedIn |
| `EMPTY_ARCHIVE` | 0-byte upload | re-download |
| `EMPTY_ARCHIVE_CONTENTS` | ZIP with no files | check archive |
| `MALFORMED_ARCHIVE` | corrupt ZIP | re-download |
| `ENTRY_TOO_LARGE` / `ARCHIVE_BOMB` | decompression limits hit | rejected |
| `PROCESSING_FAILED` | unexpected pipeline error | retry / re-upload |

Partial success: failed files are marked per-file with reasons; the import
completes and reports `Import completed with warnings`.

## Environment

See `.env.example`. Ingestion-specific: `UPLOAD_DIR`, `TEMP_DIR`,
`KEEP_RAW_UPLOADS`.

## Tests

```
pnpm test            # 48 unit tests: extraction, security, parsers, normalizer
pnpm typecheck       # all packages
```
