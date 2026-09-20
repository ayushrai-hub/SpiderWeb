import { basename, join } from 'node:path';
import { rm } from 'node:fs/promises';
import { statSync } from 'node:fs';
import type { Sql } from 'postgres';
import { ArchiveError, cleanupDir, extractArchive, isZipFile, type ExtractedEntry } from './archive.js';
import { parseCsvFile, type CsvParseResult } from './csv-parser.js';
import { detectDataset, isIgnoredFilename, type DatasetKey, type DatasetSpec } from './datasets.js';
import { normalizeDatasets, type ParsedDataset } from './normalize.js';
import { persist, emptyStats, type PersistStats } from './persist.js';
import { deriveIntelligence, type DerivationStats } from './derive.js';

export type ImportStatus = 'completed' | 'partially_completed' | 'failed';

export interface ImportFileOutcome {
  filename: string;
  archivePath: string;
  dataset: DatasetKey | null;
  datasetLabel: string | null;
  fileSize: number;
  status: 'normalized' | 'parsed' | 'skipped' | 'failed';
  reason: string | null;
  recordsDiscovered: number;
  recordsImported: number;
  recordsRejected: number;
  warnings: string[];
  errors: string[];
}

export interface ImportOutcome {
  status: ImportStatus;
  durationMs: number;
  files: ImportFileOutcome[];
  stats: PersistStats;
  derived: DerivationStats | null;
  recordsDiscovered: number;
  recordsImported: number;
  recordsUpdated: number;
  recordsDuplicate: number;
  recordsRejected: number;
  warnings: string[];
  errors: string[];
  errorCode: string | null;
}

export interface UploadedFile {
  /** Absolute path on disk. */
  path: string;
  /** Sanitised original filename. */
  filename: string;
}

/** Structured, privacy-safe logging sink. Never receives record contents. */
export interface ImportLogger {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

const noopLogger: ImportLogger = { info() {}, warn() {}, error() {} };

export interface RunImportOptions {
  sql: Sql;
  logger?: ImportLogger;
  workspaceId: string;
  importId: string;
  files: UploadedFile[];
  /** Directory the uploads live in; removed unless `keepRawUploads`. */
  uploadDir: string;
  tempDir: string;
  keepRawUploads?: boolean;
  onProgress?: (percent: number, stage: string) => void | Promise<void>;
}

const MAX_ROWS_PER_FILE = 200_000;

/**
 * postgres.js types JSON parameters as a deeply-indexed structure that plain
 * interfaces do not satisfy. The payloads here are ordinary JSON, so the cast
 * is confined to this one helper rather than scattered at call sites.
 */
function asJson(value: unknown): Parameters<Sql['json']>[0] {
  return value as Parameters<Sql['json']>[0];
}

/**
 * Process one import end to end: extract, detect, parse, normalise, persist,
 * derive. Writes its own progress and results to `imports` / `import_files`,
 * so the API and the queue worker produce identical records.
 *
 * Never throws for data problems — those become a `partially_completed` or
 * `failed` outcome with a user-readable reason.
 */
export async function runImport(options: RunImportOptions): Promise<ImportOutcome> {
  const { sql, workspaceId, importId, files, tempDir } = options;
  const log = options.logger ?? noopLogger;
  const started = Date.now();
  const progress = options.onProgress ?? (() => {});

  const outcome: ImportOutcome = {
    status: 'completed',
    durationMs: 0,
    files: [],
    stats: emptyStats(),
    derived: null,
    recordsDiscovered: 0,
    recordsImported: 0,
    recordsUpdated: 0,
    recordsDuplicate: 0,
    recordsRejected: 0,
    warnings: [],
    errors: [],
    errorCode: null,
  };

  const extractDir = join(tempDir, `import-${importId}`);

  await sql`
    UPDATE imports
    SET status = 'processing', processing_started_at = now()
    WHERE id = ${importId} AND workspace_id = ${workspaceId}
  `;
  await progress(5, 'extracting');

  try {
    // --- 1. Collect candidate files ------------------------------------
    const candidates: { archivePath: string; filename: string; path: string; bytes: number }[] = [];

    for (const file of files) {
      if (isZipFile(file.path)) {
        const extracted = extractArchive(file.path, join(extractDir, safeSegment(file.filename)));
        for (const entry of extracted.entries) candidates.push(toCandidate(entry));
        for (const r of extracted.rejected) {
          outcome.files.push(skippedFile(r.archivePath, 0, r.reason));
        }
      } else {
        let bytes = 0;
        try {
          bytes = statSync(file.path).size;
        } catch {
          bytes = 0;
        }
        candidates.push({
          archivePath: file.filename,
          filename: file.filename,
          path: file.path,
          bytes,
        });
      }
    }

    if (candidates.length === 0) {
      outcome.status = 'failed';
      outcome.errorCode = 'NO_FILES';
      outcome.errors.push('No readable files were found in the upload.');
      return await finish(options, outcome, started, extractDir);
    }

    await progress(20, 'detecting');

    // --- 2. Detect datasets and parse -----------------------------------
    const parsed: ParsedDataset[] = [];
    const byDataset = new Map<DatasetKey, ImportFileOutcome>();

    for (const candidate of candidates) {
      const ignoredReason = isIgnoredFilename(candidate.filename);
      if (ignoredReason) {
        outcome.files.push(skippedFile(candidate.archivePath, candidate.bytes, ignoredReason));
        continue;
      }
      if (!['.csv', '.tsv', '.txt'].includes(extensionOf(candidate.filename))) {
        outcome.files.push(
          skippedFile(
            candidate.archivePath,
            candidate.bytes,
            `${extensionOf(candidate.filename) || 'This file type'} is not a LinkedIn data file`
          )
        );
        continue;
      }

      let parse: CsvParseResult;
      try {
        parse = parseCsvFile(candidate.path, { maxRows: MAX_ROWS_PER_FILE });
      } catch (err) {
        outcome.files.push({
          ...skippedFile(candidate.archivePath, candidate.bytes, 'Could not be read'),
          status: 'failed',
          errors: [(err as Error).message],
        });
        continue;
      }

      if (parse.errors.length > 0 && parse.rows.length === 0) {
        outcome.files.push({
          filename: basename(candidate.archivePath),
          archivePath: candidate.archivePath,
          dataset: null,
          datasetLabel: null,
          fileSize: candidate.bytes,
          status: 'failed',
          reason: parse.errors[0],
          recordsDiscovered: 0,
          recordsImported: 0,
          recordsRejected: 0,
          warnings: parse.warnings,
          errors: parse.errors,
        });
        continue;
      }

      const spec: DatasetSpec | null = detectDataset(basename(candidate.filename), parse.headers);
      if (!spec) {
        outcome.files.push({
          ...skippedFile(candidate.archivePath, candidate.bytes, 'Not a recognised LinkedIn dataset'),
          recordsDiscovered: parse.rows.length,
          warnings: parse.warnings,
        });
        continue;
      }

      parsed.push({ dataset: spec.key, sourceFile: candidate.archivePath, parse });
      byDataset.set(spec.key, {
        filename: basename(candidate.archivePath),
        archivePath: candidate.archivePath,
        dataset: spec.key,
        datasetLabel: spec.label,
        fileSize: candidate.bytes,
        status: 'parsed',
        reason: null,
        recordsDiscovered: parse.rows.length,
        recordsImported: 0,
        recordsRejected: 0,
        warnings: parse.warnings,
        errors: parse.errors,
      });
    }

    if (parsed.length === 0) {
      outcome.status = 'failed';
      outcome.errorCode = 'NO_LINKEDIN_DATA';
      outcome.errors.push(
        'None of the uploaded files look like a LinkedIn export. Upload the ZIP LinkedIn emailed you, or CSVs such as Connections.csv.'
      );
      return await finish(options, outcome, started, extractDir);
    }

    await progress(45, 'normalizing');

    // --- 3. Normalise ----------------------------------------------------
    const normalized = normalizeDatasets(parsed);
    for (const o of normalized.outcomes) {
      const file = byDataset.get(o.dataset);
      if (!file) continue;
      file.recordsDiscovered = o.discovered;
      file.recordsImported = o.accepted;
      file.recordsRejected = o.rejected;
      file.warnings = [...new Set([...file.warnings, ...o.warnings])];
      file.errors = [...new Set([...file.errors, ...o.errors])];
      file.status = o.errors.length > 0 ? 'failed' : 'normalized';
    }
    outcome.files.push(...byDataset.values());

    await progress(60, 'saving');

    // --- 4. Persist ------------------------------------------------------
    outcome.stats = await persist({ sql, workspaceId, importId }, normalized);

    await progress(85, 'deriving');

    // --- 5. Derive -------------------------------------------------------
    outcome.derived = await deriveIntelligence(sql, workspaceId);

    // --- 6. Roll up ------------------------------------------------------
    for (const f of outcome.files) {
      outcome.recordsDiscovered += f.recordsDiscovered;
      outcome.recordsRejected += f.recordsRejected;
    }
    const s = outcome.stats;
    outcome.recordsImported =
      s.peopleCreated +
      s.connectionsCreated +
      s.companiesCreated +
      s.employmentCreated +
      s.educationCreated +
      s.skillsCreated +
      s.messagesCreated +
      s.activitiesCreated +
      s.jobsCreated;
    outcome.recordsUpdated = s.peopleUpdated + s.connectionsUpdated;
    outcome.recordsDuplicate = s.duplicatesSkipped;

    const failedFiles = outcome.files.filter((f) => f.status === 'failed');
    if (failedFiles.length > 0) {
      outcome.status = 'partially_completed';
      outcome.warnings.push(`${failedFiles.length} file(s) could not be processed.`);
    }

    await progress(95, 'finishing');
    return await finish(options, outcome, started, extractDir);
  } catch (err) {
    const error = err as Error & { code?: string };
    outcome.status = 'failed';
    outcome.errorCode = error instanceof ArchiveError ? error.code : (error.code ?? 'PROCESSING_FAILED');
    outcome.errors.push(userMessageFor(error));
    // The user-facing message is deliberately vague; the detail belongs in the
    // server log, where it is not a data-leak or an attack aid.
    log.error(
      {
        evt: 'IMPORT_FAILED',
        import_id: importId,
        workspace_id: workspaceId,
        code: outcome.errorCode,
        detail: error.message,
        stack: error.stack,
      },
      'Import failed'
    );
    return await finish(options, outcome, started, extractDir);
  }
}

function toCandidate(entry: ExtractedEntry) {
  return {
    archivePath: entry.archivePath,
    filename: entry.filename,
    path: entry.path,
    bytes: entry.bytes,
  };
}

function skippedFile(archivePath: string, bytes: number, reason: string): ImportFileOutcome {
  return {
    filename: basename(archivePath),
    archivePath,
    dataset: null,
    datasetLabel: null,
    fileSize: bytes,
    status: 'skipped',
    reason,
    recordsDiscovered: 0,
    recordsImported: 0,
    recordsRejected: 0,
    warnings: [],
    errors: [],
  };
}

function extensionOf(filename: string): string {
  return (basename(filename).match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'archive';
}

function userMessageFor(error: Error & { code?: string }): string {
  if (error instanceof ArchiveError) return error.message;
  // Database and driver errors must not leak internals to the user.
  return 'The import failed while processing your data. The file may be incomplete — try downloading a fresh export from LinkedIn.';
}

/** Write per-file rows and the import summary, then clean up temp data. */
async function finish(
  options: RunImportOptions,
  outcome: ImportOutcome,
  started: number,
  extractDir: string
): Promise<ImportOutcome> {
  const { sql, workspaceId, importId, uploadDir } = options;
  outcome.durationMs = Date.now() - started;

  try {
    await sql`DELETE FROM import_files WHERE import_id = ${importId}`;
    if (outcome.files.length > 0) {
      const rows = outcome.files.map((f) => ({
        import_id: importId,
        filename: f.filename.slice(0, 300),
        file_type: extensionOf(f.filename).replace('.', '') || null,
        dataset: f.dataset,
        file_size: f.fileSize,
        record_count: f.recordsDiscovered,
        records_imported: f.recordsImported,
        records_rejected: f.recordsRejected,
        status: f.status,
        reason: f.reason,
        warnings: sql.json(asJson(f.warnings)),
        errors: sql.json(asJson(f.errors)),
      }));
      for (let i = 0; i < rows.length; i += 200) {
        await sql`INSERT INTO import_files ${sql(
          rows.slice(i, i + 200),
          'import_id',
          'filename',
          'file_type',
          'dataset',
          'file_size',
          'record_count',
          'records_imported',
          'records_rejected',
          'status',
          'reason',
          'warnings',
          'errors'
        )}`;
      }
    }

    await sql`
      UPDATE imports SET
        status                  = ${outcome.status},
        processing_completed_at = now(),
        duration_ms             = ${outcome.durationMs},
        file_count              = ${outcome.files.length},
        record_count            = ${outcome.recordsDiscovered},
        records_discovered      = ${outcome.recordsDiscovered},
        records_imported        = ${outcome.recordsImported},
        records_updated         = ${outcome.recordsUpdated},
        records_duplicate       = ${outcome.recordsDuplicate},
        records_rejected        = ${outcome.recordsRejected},
        warning_count           = ${outcome.warnings.length + outcome.files.reduce((n, f) => n + f.warnings.length, 0)},
        error_count             = ${outcome.errors.length + outcome.files.reduce((n, f) => n + f.errors.length, 0)},
        error_code              = ${outcome.errorCode},
        error_message           = ${outcome.errors[0] ?? null},
        metadata                = ${sql.json(
          asJson({
            stats: outcome.stats,
            derived: outcome.derived,
            warnings: outcome.warnings,
          })
        )}
      WHERE id = ${importId} AND workspace_id = ${workspaceId}
    `;
  } catch (err) {
    outcome.errors.push('The import ran but its summary could not be saved.');
    outcome.status = 'partially_completed';
    (options.logger ?? noopLogger).error(
      { evt: 'IMPORT_SUMMARY_WRITE_FAILED', import_id: importId, detail: (err as Error).message },
      'Could not persist import summary'
    );
  }

  cleanupDir(extractDir);
  if (!options.keepRawUploads) {
    await rm(uploadDir, { recursive: true, force: true }).catch(() => {});
    await sql`UPDATE import_files SET s3_key = NULL WHERE import_id = ${importId}`.catch(() => {});
  }

  return outcome;
}
