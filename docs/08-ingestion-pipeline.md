# Ingestion Pipeline

## Pipeline Stages

```
UPLOAD
  ↓
FILE VALIDATION (type, size, magic bytes)
  ↓
MALWARE/FILE SAFETY CHECK (clamav or equivalent)
  ↓
ARCHIVE EXTRACTION (ZIP → temp directory)
  ↓
FILE INVENTORY (list all files, detect duplicates)
  ↓
FILE TYPE DETECTION (CSV, JSON, PDF, unknown)
  ↓
CSV SCHEMA DETECTION (column names, types, encoding)
  ↓
SOURCE IDENTIFICATION (LinkedIn adapter matches filenames)
  ↓
PARSING (adapter-specific CSV parsing)
  ↓
VALIDATION (required columns, data types, referential integrity)
  ↓
NORMALIZATION (adapter maps to canonical model)
  ↓
ENTITY RESOLUTION (dedup people/companies across sources)
  ↓
DATABASE INSERT (batch insert normalized records)
  ↓
GRAPH UPDATE (create/update graph edges)
  ↓
EMBEDDING GENERATION (vectorize people, messages, documents)
  ↓
ANALYTICS (recompute derived metrics)
  ↓
IMPORT COMPLETE
```

## Import Record

Every import receives:

- `import_id` — UUID
- `workspace_id` — tenant scope
- `source_type` — linkedin, gmail, etc.
- `source_version` — detectable version if available
- `uploaded_at` — timestamp
- `processing_status` — pending → processing → completed/failed
- `processing_started_at`
- `processing_completed_at`
- `error_count`
- `warning_count`
- `file_count`
- `record_count`

## Error Handling

- Missing files: skip, log warning
- Empty files: skip, log warning
- Malformed rows: skip row, log error, continue
- Unknown columns: store as metadata, skip
- Unknown files: store as unsupported metadata
- Schema changes: tolerate via optional columns
- Duplicate files: detect by checksum, skip

## Resumability

Pipeline checkpoints at each stage. If worker crashes, resume from last completed stage. Import status tracks progress.

## Idempotency

Same file uploaded twice → same import_id, same results. Checksum-based dedup at archive level.
