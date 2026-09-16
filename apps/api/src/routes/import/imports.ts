import type { FastifyInstance } from 'fastify';
import { query } from '@intel/shared';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/authorize.js';
import { createWriteStream } from 'fs';
import { unlink, mkdir, rm } from 'fs/promises';
import { join, extname, basename } from 'path';
import { createHash, randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';
import { Queue } from 'bullmq';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/intel-uploads';
export const MAX_ARCHIVE_SIZE = 500 * 1024 * 1024; // 500MB per file
export const MAX_FILES_PER_UPLOAD = 200;
export const MAX_TOTAL_UPLOAD_SIZE = 750 * 1024 * 1024; // 750MB total
const ALLOWED_EXTENSIONS = new Set(['.zip', '.csv', '.json']);
const LINKEDIN_CSV_NAMES = /connection|message|profile|position|education|skill|certification|project|language|invitation|note|comment|reaction|share|repost|job|follow|event|ad|registration|license|honor|volunteer|email|phone|group|[endorsement|recommendation]/i;

interface UploadFileResult {
  filename: string;
  storedPath: string | null;
  size: number;
  accepted: boolean;
  reason?: string;
}

function sanitizeFilename(filename: string): string {
  let safe = basename(filename);
  safe = safe.replace(/\0/g, '');
  safe = safe.replace(/[/\\]/g, '');
  safe = safe.replace(/[^a-zA-Z0-9._ \-()]/g, '_');
  if (safe.length > 255) {
    const ext = extname(safe);
    safe = safe.slice(0, 255 - ext.length) + ext;
  }
  return safe || 'unnamed';
}

function isAllowedUpload(filename: string): boolean {
  const ext = extname(filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) return false;
  if (ext === '.csv' && !LINKEDIN_CSV_NAMES.test(basename(filename))) {
    return false; // CSV must look like a LinkedIn export file
  }
  return true;
}

function logImportEvent(
  logger: { info: (obj: object, msg?: string) => void; error: (obj: object, msg?: string) => void },
  event: string,
  fields: Record<string, unknown>
): void {
  // Structured logging: identifiers + counts only. NEVER message content,
  // emails, phone numbers, or raw export data.
  logger.info({ evt: event, ...fields }, `IMPORT_${event}`);
}

export async function importRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  const ingestionQueue = new Queue('ingestion', {
    connection: {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6380', 10),
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });

  app.addHook('onClose', async () => {
    await ingestionQueue.close();
  });

  /**
   * POST /api/v1/imports/upload
   * Accepts ONE OR MORE files: a LinkedIn ZIP, individual CSVs, or a folder
   * selection (browser sends files sequentially under same field name).
   */
  app.post('/api/v1/imports/upload', {
    preHandler: [requireRole('owner', 'admin')],
  }, async (request, reply) => {
    const importId = randomUUID();
    const workspaceId = request.user.workspaceId;
    const userId = request.user.id;
    const importDir = join(UPLOAD_DIR, importId);

    const files: UploadFileResult[] = [];
    let totalBytes = 0;
    let primaryArchive: { storedPath: string; filename: string; size: number } | null = null;

    try {
      await mkdir(importDir, { recursive: true });

      const parts = request.parts();
      for await (const part of parts) {
        if (part.type !== 'file') continue;

        const originalName = sanitizeFilename(part.filename || 'unnamed');
        const ext = extname(originalName).toLowerCase();

        // Per-file limit
        if (part.file.bytesRead > MAX_ARCHIVE_SIZE) {
          files.push({ filename: originalName, storedPath: null, size: 0, accepted: false, reason: 'File exceeds 500MB limit' });
          part.file.resume(); // drain
          continue;
        }

        if (!isAllowedUpload(originalName)) {
          files.push({ filename: originalName, storedPath: null, size: 0, accepted: false, reason: `Unsupported file type "${ext || 'unknown'}"` });
          part.file.resume(); // drain
          continue;
        }

        if (files.filter((f) => f.accepted).length >= MAX_FILES_PER_UPLOAD) {
          files.push({ filename: originalName, storedPath: null, size: 0, accepted: false, reason: 'Too many files (limit 200)' });
          part.file.resume();
          continue;
        }

        const storedPath = join(importDir, `${files.length}-${originalName}`);
        let written = 0;
        const ws = createWriteStream(storedPath);

        try {
          await pipeline(part.file, async function* (source) {
            for await (const chunk of source) {
              written += (chunk as Buffer).length;
              if (written > MAX_ARCHIVE_SIZE) {
                throw Object.assign(new Error('File exceeds 500MB limit'), { statusCode: 413 });
              }
              yield chunk;
            }
          }, ws);
        } catch (err) {
          const error = err as Error & { statusCode?: number };
          if (error.statusCode === 413) {
            files.push({ filename: originalName, storedPath: null, size: written, accepted: false, reason: 'File exceeds 500MB limit' });
            await rm(storedPath, { force: true }).catch(() => {});
            continue;
          }
          throw err;
        }

        const size = written;
        totalBytes += size;

        if (size === 0) {
          files.push({ filename: originalName, storedPath: null, size: 0, accepted: false, reason: 'File is empty' });
          await rm(storedPath, { force: true }).catch(() => {});
          continue;
        }

        files.push({ filename: originalName, storedPath, size, accepted: true });

        if (ext === '.zip' && !primaryArchive) {
          primaryArchive = { storedPath, filename: originalName, size };
        }
      }

      const accepted = files.filter((f) => f.accepted);
      if (accepted.length === 0) {
        await rm(importDir, { recursive: true, force: true }).catch(() => {});
        const reasons = files.slice(0, 5).map((f) => `${f.filename}: ${f.reason}`).join('; ');
        return reply.status(400).send({
          error: {
            code: 'NO_VALID_FILES',
            message: `No valid files to import. ${reasons || 'Provide a LinkedIn ZIP or CSV export files.'}`,
          },
        });
      }

      if (totalBytes > MAX_TOTAL_UPLOAD_SIZE) {
        await rm(importDir, { recursive: true, force: true }).catch(() => {});
        return reply.status(413).send({
          error: {
            code: 'TOTAL_SIZE_EXCEEDED',
            message: `Total upload size ${Math.round(totalBytes / 1024 / 1024)}MB exceeds ${Math.round(MAX_TOTAL_UPLOAD_SIZE / 1024 / 1024)}MB limit`,
          },
        });
      }

      // Checksum the primary archive (streamed, not readFileSync)
      let checksum: string | null = null;
      if (primaryArchive) {
        const { createReadStream } = await import('fs');
        const hash = createHash('sha256');
        const { Readable } = await import('stream');
        const stream = Readable.from(createReadStream(primaryArchive.storedPath));
        for await (const chunk of stream) hash.update(chunk as Buffer);
        checksum = hash.digest('hex');
      }

      // Parameterized queries — no SQL injection
      await query(
        `INSERT INTO imports (id, workspace_id, source_type, status, file_count, checksum, uploaded_at)
         VALUES ($1, $2, 'linkedin', 'pending', $3, $4, NOW())`,
        [importId, workspaceId, accepted.length, checksum]
      );

      for (const f of accepted) {
        const ext = extname(f.filename).toLowerCase();
        await query(
          `INSERT INTO import_files (import_id, filename, file_type, status, s3_key, file_size)
           VALUES ($1, $2, $3, 'pending', $4, $5)`,
          [importId, f.filename, ext === '.zip' ? 'zip' : 'csv', f.storedPath, f.size]
        );
      }

      logImportEvent(app.log, 'CREATED', { import_id: importId, workspace_id: workspaceId, user_id: userId, file_count: accepted.length, total_bytes: totalBytes });

      const job = await ingestionQueue.add('process-import', {
        importId,
        workspaceId,
        userId,
        importDir,
        files: accepted.map((f) => ({ storedPath: f.storedPath, filename: f.filename, size: f.size })),
        primaryArchive: primaryArchive ? { storedPath: primaryArchive.storedPath, filename: primaryArchive.filename } : null,
        retry: false,
      }, { priority: 1 });

      await query(
        `UPDATE imports SET metadata = jsonb_build_object('job_id', $1::text, 'queue', 'ingestion') WHERE id = $2`,
        [String(job.id), importId]
      );

      logImportEvent(app.log, 'UPLOAD_COMPLETED', { import_id: importId, queued_job: String(job.id) });

      return reply.status(201).send({
        data: {
          importId,
          jobId: job.id,
          status: 'queued',
          filename: primaryArchive?.filename ?? accepted[0].filename,
          fileCount: accepted.length,
          totalBytes,
          checksum,
          rejected: files.filter((f) => !f.accepted).map((f) => ({ filename: f.filename, reason: f.reason })),
        },
      });
    } catch (err) {
      const error = err as Error;
      // Clean up partial upload on failure
      await rm(importDir, { recursive: true, force: true }).catch(() => {});
      logImportEvent(app.log, 'UPLOAD_FAILED', { import_id: importId, code: 'UPLOAD_FAILED' });
      return reply.status(500).send({
        error: { code: 'UPLOAD_FAILED', message: 'Upload could not be processed. Try again.' },
      });
    }
  });

  // GET import status (polled by frontend)
  app.get('/api/v1/imports/:importId', async (request, reply) => {
    const { importId } = request.params as { importId: string };
    const workspaceId = request.user.workspaceId;

    const results = await query(
      `SELECT i.*, 
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', f.id, 'filename', f.filename, 'file_type', f.file_type,
            'status', f.status, 'record_count', f.record_count,
            'warnings', f.warnings, 'errors', f.errors
          ) ORDER BY f.filename)
          FROM import_files f WHERE f.import_id = i.id
        ), '[]'::jsonb) as files
      FROM imports i WHERE i.id = $1 AND i.workspace_id = $2`,
      [importId, workspaceId]
    );

    if (results.length === 0) {
      return reply.status(404).send({
        error: { code: 'IMPORT_NOT_FOUND', message: 'Import not found' },
      });
    }

    const importRecord = results[0] as any;
    const jobId = importRecord.metadata?.job_id;
    let jobStatus: any = null;
    if (jobId) {
      try {
        const job = await ingestionQueue.getJob(String(jobId));
        if (job) {
          jobStatus = {
            jobId: job.id,
            state: await job.getState(),
            progress: job.progress,
            failedReason: job.failedReason,
            processedOn: job.processedOn,
            finishedOn: job.finishedOn,
          };
        }
      } catch {
        // job cleaned up — DB status remains source of truth
      }
    }

    return reply.send({ data: { ...importRecord, jobStatus } });
  });

  // List imports
  app.get('/api/v1/imports', async (request, reply) => {
    const workspaceId = request.user.workspaceId;
    const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number };
    const offset = (Math.max(1, Number(page)) - 1) * Math.min(100, Number(limit));
    const lim = Math.min(100, Number(limit));

    const countResults = await query(
      `SELECT COUNT(*) as count FROM imports WHERE workspace_id = $1`,
      [workspaceId]
    );
    const total = parseInt((countResults[0] as any).count, 10);

    const results = await query(
      `SELECT i.*,
        (SELECT COUNT(*) FROM import_files f WHERE f.import_id = i.id) as file_count,
        (SELECT COALESCE(SUM(f.record_count), 0) FROM import_files f WHERE f.import_id = i.id) as total_records
      FROM imports i WHERE i.workspace_id = $1
      ORDER BY i.uploaded_at DESC LIMIT $2 OFFSET $3`,
      [workspaceId, lim, offset]
    );

    return reply.send({
      data: results,
      pagination: { page: Number(page), limit: lim, total, totalPages: Math.ceil(total / lim) },
    });
  });

  // Get import summary
  app.get('/api/v1/imports/:importId/summary', async (request, reply) => {
    const { importId } = request.params as { importId: string };
    const workspaceId = request.user.workspaceId;

    const importResults = await query(
      `SELECT * FROM imports WHERE id = $1 AND workspace_id = $2`,
      [importId, workspaceId]
    );
    if (importResults.length === 0) {
      return reply.status(404).send({ error: { code: 'IMPORT_NOT_FOUND', message: 'Import not found' } });
    }

    const filesResults = await query(
      `SELECT * FROM import_files WHERE import_id = $1 ORDER BY filename`,
      [importId]
    );

    const [peopleCount, companiesCount, connectionsCount, messagesCount] = await Promise.all([
      query(`SELECT COUNT(*) as count FROM people WHERE workspace_id = $1`, [workspaceId]),
      query(`SELECT COUNT(*) as count FROM companies WHERE workspace_id = $1`, [workspaceId]),
      query(`SELECT COUNT(*) as count FROM connections WHERE workspace_id = $1`, [workspaceId]),
      query(`SELECT COUNT(*) as count FROM messages WHERE workspace_id = $1`, [workspaceId]),
    ]);

    return reply.send({
      data: {
        import: importResults[0],
        files: filesResults,
        stats: {
          people: parseInt((peopleCount[0] as any).count, 10),
          companies: parseInt((companiesCount[0] as any).count, 10),
          connections: parseInt((connectionsCount[0] as any).count, 10),
          messages: parseInt((messagesCount[0] as any).count, 10),
        },
      },
    });
  });

  // Cancel import
  app.post('/api/v1/imports/:importId/cancel', {
    preHandler: [requireRole('owner', 'admin')],
  }, async (request, reply) => {
    const { importId } = request.params as { importId: string };
    const workspaceId = request.user.workspaceId;

    const importResults = await query(
      `SELECT * FROM imports WHERE id = $1 AND workspace_id = $2`,
      [importId, workspaceId]
    );
    if (importResults.length === 0) {
      return reply.status(404).send({ error: { code: 'IMPORT_NOT_FOUND', message: 'Import not found' } });
    }

    const importRecord = importResults[0] as any;
    const jobId = importRecord.metadata?.job_id;
    if (jobId) {
      try {
        const job = await ingestionQueue.getJob(String(jobId));
        if (job) await job.remove();
      } catch { /* started or done */ }
    }

    await query(
      `UPDATE imports SET status = 'failed', metadata = jsonb_set(COALESCE(metadata, '{}'), '{cancelled_at}', to_jsonb(NOW()::text), true) WHERE id = $1`,
      [importId]
    );
    await cleanupImportFiles(importId);

    return reply.send({ data: { importId, status: 'cancelled' } });
  });

  // Retry failed import
  app.post('/api/v1/imports/:importId/retry', {
    preHandler: [requireRole('owner', 'admin')],
  }, async (request, reply) => {
    const { importId } = request.params as { importId: string };
    const workspaceId = request.user.workspaceId;

    const importResults = await query(
      `SELECT * FROM imports WHERE id = $1 AND workspace_id = $2`,
      [importId, workspaceId]
    );
    if (importResults.length === 0) {
      return reply.status(404).send({ error: { code: 'IMPORT_NOT_FOUND', message: 'Import not found' } });
    }
    const importRecord = importResults[0] as any;
    if (importRecord.status !== 'failed' && importRecord.status !== 'partial') {
      return reply.status(400).send({ error: { code: 'INVALID_STATUS', message: 'Only failed or partial imports can be retried' } });
    }

    const filesResults = await query(
      `SELECT * FROM import_files WHERE import_id = $1 LIMIT 1`,
      [importId]
    );
    if (filesResults.length === 0) {
      return reply.status(400).send({ error: { code: 'NO_FILES', message: 'No files found for import' } });
    }
    const importFile = filesResults[0] as any;
    const importDir = dirname(importFile.s3_key);

    const { existsSync } = await import('fs');
    if (!importDir || !existsSync(importDir)) {
      return reply.status(400).send({ error: { code: 'FILE_MISSING', message: 'Uploaded files are no longer available. Please re-upload.' } });
    }

    await query(`UPDATE imports SET status = 'pending' WHERE id = $1`, [importId]);

    const job = await ingestionQueue.add('process-import', {
      importId,
      workspaceId,
      userId: request.user.id,
      importDir,
      files: (await query(`SELECT s3_key, filename, file_size FROM import_files WHERE import_id = $1`, [importId]))
        .map((r: any) => ({ storedPath: r.s3_key, filename: r.filename, size: r.file_size })),
      primaryArchive: null,
      retry: true,
    }, { priority: 1 });

    await query(
      `UPDATE imports SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{job_id}', to_jsonb($1::text), true) WHERE id = $2`,
      [String(job.id), importId]
    );

    return reply.send({ data: { importId, jobId: job.id, status: 'queued' } });
  });

  // Delete import — removes records AND disk files (privacy requirement)
  app.delete('/api/v1/imports/:importId', {
    preHandler: [requireRole('owner')],
  }, async (request, reply) => {
    const { importId } = request.params as { importId: string };
    const workspaceId = request.user.workspaceId;

    const importResults = await query(
      `SELECT id FROM imports WHERE id = $1 AND workspace_id = $2`,
      [importId, workspaceId]
    );
    if (importResults.length === 0) {
      return reply.status(404).send({ error: { code: 'IMPORT_NOT_FOUND', message: 'Import not found' } });
    }

    const importRecord = importResults[0] as any;
    const jobId = importRecord.metadata?.job_id;
    if (jobId) {
      try {
        const job = await ingestionQueue.getJob(String(jobId));
        if (job) await job.remove();
      } catch { /* ignore */ }
    }

    await cleanupImportFiles(importId);
    await query(`DELETE FROM import_files WHERE import_id = $1`, [importId]);
    await query(`DELETE FROM imports WHERE id = $1`, [importId]);

    logImportEvent(app.log, 'DELETED', { import_id: importId });
    return reply.status(204).send();
  });
}

async function cleanupImportFiles(importId: string): Promise<void> {
  const rows = await query(`SELECT s3_key FROM import_files WHERE import_id = $1 AND s3_key IS NOT NULL`, [importId]);
  for (const row of rows as any[]) {
    if (row.s3_key) await unlink(row.s3_key).catch(() => {});
  }
  // Remove import directory if empty-ish (best effort)
  const rowsAny = rows as any[];
  if (rowsAny[0]?.s3_key) {
    const dir = dirname(rowsAny[0].s3_key);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function dirname(p: string | null): string {
  if (!p) return '';
  const idx = p.lastIndexOf('/');
  return idx > 0 ? p.slice(0, idx) : '';
}
