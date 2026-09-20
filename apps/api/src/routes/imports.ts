import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { basename, extname, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { getEnv, query } from '@intel/shared';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { uploadRateLimit, writeRateLimit } from '../middleware/rate-limit.js';
import { ApiError, notFound } from '../middleware/error-handler.js';
import { dispatchImport } from '../services/ingestion.js';
import { recordAudit } from '../services/audit.js';

export const MAX_FILE_BYTES = 500 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 750 * 1024 * 1024;
export const MAX_FILES = 200;
const ALLOWED_EXTENSIONS = new Set(['.zip', '.csv', '.tsv', '.txt']);

interface StoredFile {
  filename: string;
  path: string;
  bytes: number;
}

interface RejectedFile {
  filename: string;
  reason: string;
}

/**
 * Filenames from a browser upload are attacker-controlled. Reduce to a bare
 * basename with a conservative character set; the file is written under a
 * server-generated directory using a server-generated index prefix, so the
 * original name is only ever used for display.
 */
export function sanitizeFilename(input: string): string {
  const base = basename(input.replace(/\\/g, '/'))
    .replace(/\0/g, '')
    .replace(/[^a-zA-Z0-9._ ()-]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  if (!base) return 'unnamed';
  return base.length > 200 ? base.slice(0, 200 - extname(base).length) + extname(base) : base;
}

export function isAllowedUpload(filename: string): boolean {
  return ALLOWED_EXTENSIONS.has(extname(filename).toLowerCase());
}

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function importRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.post(
    '/api/v1/imports',
    { preHandler: [requireRole('owner', 'admin'), uploadRateLimit] },
    async (request, reply) => {
      const env = getEnv();
      const importId = randomUUID();
      const { workspaceId, id: userId } = request.user;
      const uploadDir = resolve(join(env.UPLOAD_DIR, importId));

      const stored: StoredFile[] = [];
      const rejected: RejectedFile[] = [];
      let totalBytes = 0;

      try {
        await mkdir(uploadDir, { recursive: true });

        for await (const part of request.parts()) {
          if (part.type !== 'file') continue;
          const filename = sanitizeFilename(part.filename ?? 'unnamed');

          if (!isAllowedUpload(filename)) {
            rejected.push({
              filename,
              reason: `${extname(filename) || 'That file type'} is not supported. Upload the LinkedIn .zip or its .csv files.`,
            });
            part.file.resume();
            continue;
          }
          if (stored.length >= MAX_FILES) {
            rejected.push({ filename, reason: `Only ${MAX_FILES} files can be uploaded at once.` });
            part.file.resume();
            continue;
          }

          const target = join(uploadDir, `${stored.length}-${filename}`);
          let written = 0;
          try {
            await pipeline(
              part.file,
              async function* (source) {
                for await (const chunk of source) {
                  written += (chunk as Buffer).length;
                  if (written > MAX_FILE_BYTES) {
                    throw new ApiError(413, 'FILE_TOO_LARGE', `${filename} is larger than 500MB.`);
                  }
                  if (totalBytes + written > MAX_TOTAL_BYTES) {
                    throw new ApiError(413, 'UPLOAD_TOO_LARGE', 'The upload is larger than 750MB in total.');
                  }
                  yield chunk;
                }
              },
              createWriteStream(target)
            );
          } catch (err) {
            await rm(target, { force: true }).catch(() => {});
            if (err instanceof ApiError) {
              rejected.push({ filename, reason: err.message });
              continue;
            }
            throw err;
          }

          if (written === 0) {
            await rm(target, { force: true }).catch(() => {});
            rejected.push({ filename, reason: 'The file is empty.' });
            continue;
          }

          totalBytes += written;
          stored.push({ filename, path: target, bytes: written });
        }

        if (stored.length === 0) {
          await rm(uploadDir, { recursive: true, force: true }).catch(() => {});
          throw new ApiError(
            400,
            'NO_VALID_FILES',
            rejected.length
              ? `Nothing could be imported. ${rejected[0].filename}: ${rejected[0].reason}`
              : 'No file was received. Choose your LinkedIn export ZIP or its CSV files.',
            { rejected }
          );
        }

        const checksum = await checksumOf(stored);
        const primary = stored.find((f) => extname(f.filename).toLowerCase() === '.zip') ?? stored[0];

        const [previous] = await query<{ id: string; uploaded_at: Date }>(
          `SELECT id, uploaded_at FROM imports
         WHERE workspace_id = $1 AND checksum = $2 AND status IN ('completed','partially_completed')
         ORDER BY uploaded_at DESC LIMIT 1`,
          [workspaceId, checksum]
        );

        await query(
          `INSERT INTO imports (id, workspace_id, created_by, source_type, status, filename, file_count, checksum)
         VALUES ($1, $2, $3, 'linkedin', 'pending', $4, $5, $6)`,
          [importId, workspaceId, userId, primary.filename, stored.length, checksum]
        );

        const dispatch = await dispatchImport(
          {
            importId,
            workspaceId,
            userId,
            files: stored.map((f) => ({ path: f.path, filename: f.filename })),
            uploadDir,
          },
          request.log
        );

        request.log.info(
          {
            evt: 'IMPORT_UPLOADED',
            import_id: importId,
            workspace_id: workspaceId,
            file_count: stored.length,
            total_bytes: totalBytes,
            mode: dispatch.mode,
          },
          'Import uploaded'
        );

        return reply.status(202).send({
          data: {
            importId,
            status: 'pending',
            mode: dispatch.mode,
            filename: primary.filename,
            fileCount: stored.length,
            totalBytes,
            rejected,
            /** Set when this exact upload was processed before. */
            previouslyImportedAt: previous ? new Date(previous.uploaded_at).toISOString() : null,
          },
        });
      } catch (err) {
        await rm(uploadDir, { recursive: true, force: true }).catch(() => {});
        await query(`DELETE FROM imports WHERE id = $1 AND status = 'pending'`, [importId]).catch(() => {});
        throw err;
      }
    }
  );

  app.get('/api/v1/imports', async (request) => {
    const { page, limit } = listQuery.parse(request.query);
    const workspaceId = request.user.workspaceId;

    const [countRow] = await query<{ count: number }>(
      `SELECT count(*)::int AS count FROM imports WHERE workspace_id = $1`,
      [workspaceId]
    );
    const rows = await query<Record<string, unknown>>(
      `SELECT id, filename, status, uploaded_at, processing_started_at, processing_completed_at,
              duration_ms, file_count, records_discovered, records_imported, records_updated,
              records_duplicate, records_rejected, warning_count, error_count, error_code, error_message
       FROM imports WHERE workspace_id = $1
       ORDER BY uploaded_at DESC LIMIT $2 OFFSET $3`,
      [workspaceId, limit, (page - 1) * limit]
    );

    return {
      data: rows.map(toImportSummary),
      pagination: {
        page,
        limit,
        total: countRow?.count ?? 0,
        totalPages: Math.ceil((countRow?.count ?? 0) / limit),
      },
    };
  });

  app.get('/api/v1/imports/:importId', async (request) => {
    const { importId } = request.params as { importId: string };
    const workspaceId = request.user.workspaceId;

    const [row] = await query<Record<string, unknown>>(
      `SELECT * FROM imports WHERE id = $1 AND workspace_id = $2`,
      [importId, workspaceId]
    );
    if (!row) throw notFound('That import');

    const files = await query<Record<string, unknown>>(
      `SELECT filename, dataset, status, reason, file_size, record_count,
              records_imported, records_rejected, warnings, errors
       FROM import_files WHERE import_id = $1
       ORDER BY (dataset IS NULL), dataset, filename`,
      [importId]
    );

    return {
      data: {
        ...toImportSummary(row),
        metadata: sanitizeMetadata(row.metadata),
        files: files.map((f) => ({
          filename: f.filename,
          dataset: f.dataset,
          status: f.status,
          reason: f.reason,
          fileSize: Number(f.file_size ?? 0),
          recordsDiscovered: Number(f.record_count ?? 0),
          recordsImported: Number(f.records_imported ?? 0),
          recordsRejected: Number(f.records_rejected ?? 0),
          warnings: (f.warnings as string[] | null) ?? [],
          errors: (f.errors as string[] | null) ?? [],
        })),
      },
    };
  });

  /**
   * Delete an import. `withData=true` also removes the people, companies and
   * messages that arrived only in this import; by default the record is
   * removed but the network it produced is kept.
   */
  app.delete(
    '/api/v1/imports/:importId',
    { preHandler: [requireRole('owner', 'admin'), writeRateLimit] },
    async (request, reply) => {
      const { importId } = request.params as { importId: string };
      const withData = (request.query as { withData?: string }).withData === 'true';
      const workspaceId = request.user.workspaceId;

      const [row] = await query<{ id: string }>(
        `SELECT id FROM imports WHERE id = $1 AND workspace_id = $2`,
        [importId, workspaceId]
      );
      if (!row) throw notFound('That import');

      let removedPeople = 0;
      if (withData) {
        const deleted = await query<{ id: string }>(
          `DELETE FROM people
         WHERE workspace_id = $1 AND first_import_id = $2 AND last_import_id = $2
         RETURNING id`,
          [workspaceId, importId]
        );
        removedPeople = deleted.length;
        await refreshDerived(workspaceId);
      }

      await query(`DELETE FROM imports WHERE id = $1 AND workspace_id = $2`, [importId, workspaceId]);

      await recordAudit({
        workspaceId,
        userId: request.user.id,
        action: withData ? 'import.delete_with_data' : 'import.delete',
        resource: 'import',
        resourceId: importId,
        metadata: { removedPeople },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      });

      return reply.send({ data: { importId, removedPeople } });
    }
  );

  /** Re-run derived analytics without re-uploading anything. */
  app.post(
    '/api/v1/imports/refresh-analytics',
    { preHandler: [requireRole('owner', 'admin'), writeRateLimit] },
    async (request) => {
      const stats = await refreshDerived(request.user.workspaceId);
      return { data: stats };
    }
  );
}

async function refreshDerived(workspaceId: string) {
  const { deriveIntelligence } = await import('@intel/ingestion');
  const { getSql } = await import('@intel/shared');
  return deriveIntelligence(getSql(), workspaceId);
}

async function checksumOf(files: StoredFile[]): Promise<string> {
  const { createReadStream } = await import('node:fs');
  const hash = createHash('sha256');
  for (const file of [...files].sort((a, b) => a.filename.localeCompare(b.filename))) {
    hash.update(file.filename);
    await pipeline(createReadStream(file.path), async function* (source) {
      for await (const chunk of source) hash.update(chunk as Buffer);
      yield* [];
    }).catch(async () => {
      // Fall back to size when the stream cannot be read.
      const s = await stat(file.path).catch(() => null);
      hash.update(String(s?.size ?? 0));
    });
  }
  return hash.digest('hex');
}

function toImportSummary(row: Record<string, unknown>) {
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return {
    id: row.id as string,
    filename: (row.filename as string) ?? null,
    status: row.status as string,
    uploadedAt: iso(row.uploaded_at),
    startedAt: iso(row.processing_started_at),
    completedAt: iso(row.processing_completed_at),
    durationMs: row.duration_ms === null || row.duration_ms === undefined ? null : Number(row.duration_ms),
    fileCount: Number(row.file_count ?? 0),
    recordsDiscovered: Number(row.records_discovered ?? 0),
    recordsImported: Number(row.records_imported ?? 0),
    recordsUpdated: Number(row.records_updated ?? 0),
    recordsDuplicate: Number(row.records_duplicate ?? 0),
    recordsRejected: Number(row.records_rejected ?? 0),
    warningCount: Number(row.warning_count ?? 0),
    errorCount: Number(row.error_count ?? 0),
    errorCode: (row.error_code as string) ?? null,
    errorMessage: (row.error_message as string) ?? null,
  };
}

/** Never return internal job plumbing to the browser. */
function sanitizeMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object') return {};
  const { stats, derived, warnings } = metadata as Record<string, unknown>;
  return { stats: stats ?? null, derived: derived ?? null, warnings: warnings ?? [] };
}
