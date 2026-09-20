import type { FastifyBaseLogger } from 'fastify';
import { Queue } from 'bullmq';
import { getEnv, getSql, query } from '@intel/shared';
import { runImport, type ImportOutcome, type UploadedFile } from '@intel/ingestion';

export interface DispatchRequest {
  importId: string;
  workspaceId: string;
  userId: string;
  files: UploadedFile[];
  uploadDir: string;
}

export type DispatchMode = 'inline' | 'queue';

let queue: Queue | null = null;

/** BullMQ queue, created lazily and only when queue mode is configured. */
export function getIngestionQueue(): Queue | null {
  const env = getEnv();
  if (env.INGESTION_MODE !== 'queue' || !env.REDIS_URL) return null;
  if (!queue) {
    queue = new Queue('ingestion', {
      connection: { url: env.REDIS_URL },
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 100 },
      },
    });
  }
  return queue;
}

export async function closeIngestionQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}

/**
 * Bound on concurrent in-process imports. Parsing and inserting an archive is
 * CPU- and connection-hungry; without a bound, several simultaneous uploads
 * would starve ordinary API requests of database connections.
 */
const MAX_INLINE = 2;
const running = new Set<string>();
const waiting: DispatchRequest[] = [];

export interface DispatchResult {
  mode: DispatchMode;
  jobId: string | null;
}

/**
 * Hand an uploaded import off for processing.
 *
 * In `queue` mode the ingestion worker picks it up. In `inline` mode (the
 * default, so a single `pnpm dev` is a working product) the API processes it in
 * the background and the client polls the import record for progress.
 */
export async function dispatchImport(
  req: DispatchRequest,
  logger: FastifyBaseLogger
): Promise<DispatchResult> {
  const env = getEnv();
  const q = getIngestionQueue();

  if (q) {
    const job = await q.add('process-import', req, { jobId: req.importId });
    await query(
      `UPDATE imports SET metadata = metadata || jsonb_build_object('job_id', $1::text, 'mode', 'queue') WHERE id = $2`,
      [String(job.id), req.importId]
    );
    return { mode: 'queue', jobId: String(job.id) };
  }

  if (env.INGESTION_MODE === 'queue') {
    throw new Error('INGESTION_MODE=queue but no Redis connection is configured');
  }

  await query(
    `UPDATE imports SET metadata = metadata || jsonb_build_object('mode', 'inline') WHERE id = $1`,
    [req.importId]
  );
  enqueueInline(req, logger);
  return { mode: 'inline', jobId: null };
}

function enqueueInline(req: DispatchRequest, logger: FastifyBaseLogger): void {
  if (running.size >= MAX_INLINE) {
    waiting.push(req);
    logger.info(
      { evt: 'IMPORT_QUEUED_INLINE', import_id: req.importId, depth: waiting.length },
      'Import waiting for a slot'
    );
    return;
  }
  running.add(req.importId);
  void processInline(req, logger).finally(() => {
    running.delete(req.importId);
    const next = waiting.shift();
    if (next) enqueueInline(next, logger);
  });
}

async function processInline(req: DispatchRequest, logger: FastifyBaseLogger): Promise<ImportOutcome | null> {
  const env = getEnv();
  try {
    const outcome = await runImport({
      sql: getSql(),
      logger,
      workspaceId: req.workspaceId,
      importId: req.importId,
      files: req.files,
      uploadDir: req.uploadDir,
      tempDir: env.TEMP_DIR,
      keepRawUploads: env.KEEP_RAW_UPLOADS,
    });
    logger.info(
      {
        evt: 'IMPORT_FINISHED',
        import_id: req.importId,
        workspace_id: req.workspaceId,
        status: outcome.status,
        duration_ms: outcome.durationMs,
        records_imported: outcome.recordsImported,
      },
      'Import finished'
    );
    return outcome;
  } catch (err) {
    // runImport handles its own failures; reaching here means something outside
    // it broke, and the import row must not be left stuck in "processing".
    logger.error({ err, evt: 'IMPORT_CRASHED', import_id: req.importId }, 'Import crashed');
    await query(
      `UPDATE imports SET status = 'failed', error_code = 'PROCESSING_CRASHED',
         error_message = 'The import stopped unexpectedly. Please try again.',
         processing_completed_at = now()
       WHERE id = $1 AND status IN ('pending','processing')`,
      [req.importId]
    ).catch(() => {});
    return null;
  }
}

/** Number of imports currently being processed in this process. */
export function inlineLoad(): { running: number; waiting: number } {
  return { running: running.size, waiting: waiting.length };
}
