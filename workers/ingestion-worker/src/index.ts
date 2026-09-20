import { Worker, type Job } from 'bullmq';
import pino from 'pino';
import { closeDb, closeRedis, getSql, query } from '@intel/shared';
import { runImport, type UploadedFile } from '@intel/ingestion';
import { config } from './config.js';

/**
 * Optional scale-out consumer for the ingestion queue.
 *
 * The API can process imports in-process (INGESTION_MODE=inline, the default).
 * Run this worker when you want ingestion off the request path; it calls the
 * same `runImport` so behaviour and records are identical either way.
 */
/**
 * Pretty logs in development, plain JSON otherwise. pino-pretty is a dev-only
 * dependency, so a production bundle that lacks it must still start.
 */
function createLogger() {
  if (config.NODE_ENV === 'development') {
    try {
      return pino({ level: config.LOG_LEVEL, transport: { target: 'pino-pretty' } });
    } catch {
      // Fall through to JSON logging.
    }
  }
  return pino({ level: config.LOG_LEVEL });
}

const logger = createLogger();

interface ImportJobData {
  importId: string;
  workspaceId: string;
  userId: string;
  uploadDir: string;
  files: UploadedFile[];
}

if (!config.REDIS_URL) {
  logger.error('REDIS_URL is required to run the ingestion worker.');
  process.exit(1);
}

const worker = new Worker<ImportJobData>(
  'ingestion',
  async (job: Job<ImportJobData>) => {
    const { importId, workspaceId, files, uploadDir } = job.data;
    logger.info(
      { evt: 'IMPORT_STARTED', import_id: importId, workspace_id: workspaceId },
      'Processing import'
    );

    const outcome = await runImport({
      sql: getSql(),
      logger,
      workspaceId,
      importId,
      files,
      uploadDir,
      tempDir: config.TEMP_DIR,
      keepRawUploads: config.KEEP_RAW_UPLOADS,
      onProgress: (percent) => job.updateProgress(percent),
    });

    logger.info(
      {
        evt: 'IMPORT_FINISHED',
        import_id: importId,
        status: outcome.status,
        duration_ms: outcome.durationMs,
        records_imported: outcome.recordsImported,
      },
      'Import finished'
    );
    return { status: outcome.status, importId };
  },
  {
    connection: { url: config.REDIS_URL },
    concurrency: 2,
  }
);

worker.on('failed', async (job, err) => {
  const importId = job?.data?.importId;
  logger.error({ evt: 'IMPORT_JOB_FAILED', import_id: importId, err: err.message }, 'Import job failed');
  // runImport records its own failures; this covers a crash before or inside it.
  if (importId) {
    await query(
      `UPDATE imports SET status = 'failed', error_code = 'WORKER_FAILED',
         error_message = 'The import stopped unexpectedly. Please try again.',
         processing_completed_at = now()
       WHERE id = $1 AND status IN ('pending','processing')`,
      [importId]
    ).catch(() => {});
  }
});

worker.on('stalled', (jobId) =>
  logger.warn({ evt: 'IMPORT_JOB_STALLED', job_id: jobId }, 'Import job stalled')
);

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down`);
  await worker.close();
  await closeRedis();
  await closeDb();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

logger.info('Ingestion worker ready');
