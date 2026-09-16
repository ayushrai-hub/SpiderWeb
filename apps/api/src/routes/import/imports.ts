import type { FastifyInstance } from 'fastify';
import { getDb } from '@intel/shared';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/authorize.js';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join, basename, extname } from 'path';
import { createHash, randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { Queue } from 'bullmq';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/intel-uploads';
const MAX_ARCHIVE_SIZE = 500 * 1024 * 1024; // 500MB
const ALLOWED_EXTENSIONS = ['.zip'];

// Ensure upload directory exists
mkdirSync(UPLOAD_DIR, { recursive: true });

// BullMQ queue for ingestion jobs
const ingestionQueue = new Queue('ingestion', {
  connection: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6380', 10),
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

function sanitizeFilename(filename: string): string {
  let safe = basename(filename);
  safe = safe.replace(/\0/g, '');
  safe = safe.replace(/[/\\]/g, '');
  if (safe.length > 255) {
    const ext = extname(safe);
    safe = safe.slice(0, 255 - ext.length) + ext;
  }
  return safe || 'unnamed.zip';
}

function calculateChecksum(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function escapeString(str: string): string {
  return str.replace(/'/g, "''");
}

export async function importRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // Upload LinkedIn ZIP with real file handling
  app.post('/api/v1/imports/upload', {
    preHandler: [requireRole('owner', 'admin')],
  }, async (request, reply) => {
    try {
      const workspaceId = request.user.workspaceId;
      const userId = request.user.id;
      
      // Get multipart data
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({
          error: {
            code: 'NO_FILE',
            message: 'No file provided',
          },
        });
      }

      const originalFilename = sanitizeFilename(data.filename);
      
      // Validate file extension
      if (!ALLOWED_EXTENSIONS.includes(extname(originalFilename).toLowerCase())) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_FILE_TYPE',
            message: 'Only ZIP files are supported',
          },
        });
      }

      // Generate import ID and file paths
      const importId = randomUUID();
      const storageFilename = `${importId}-${originalFilename}`;
      const archivePath = join(UPLOAD_DIR, storageFilename);
      
      // Stream file to disk with size checking
      let totalBytes = 0;
      const writeStream = createWriteStream(archivePath);
      
      await pipeline(data.file, async function* (source) {
        for await (const chunk of source) {
          totalBytes += chunk.length;
          if (totalBytes > MAX_ARCHIVE_SIZE) {
            writeStream.destroy();
            throw new Error(`Archive exceeds maximum size of ${MAX_ARCHIVE_SIZE / 1024 / 1024}MB`);
          }
          yield chunk;
        }
      }, writeStream);

      // Calculate checksum
      const fileBuffer = readFileSync(archivePath);
      const checksum = calculateChecksum(fileBuffer);

      // Create import record in database
      const db = getDb();
      
      await db.execute(`
        INSERT INTO imports (id, workspace_id, source_type, status, file_count, checksum, uploaded_at)
        VALUES ('${importId}', '${workspaceId}', 'linkedin', 'pending', 0, '${checksum}', NOW())
      `);

      // Create import file record
      await db.execute(`
        INSERT INTO import_files (import_id, filename, file_type, status, s3_key, checksum)
        VALUES ('${importId}', '${escapeString(originalFilename)}', 'zip', 'pending', '${escapeString(archivePath)}', '${checksum}')
      `);

      // Enqueue ingestion job
      const job = await ingestionQueue.add('process-import', {
        importId,
        workspaceId,
        userId,
        archivePath,
        filename: originalFilename,
      }, {
        priority: 1,
      });

      // Update import with job ID
      await db.execute(`
        UPDATE imports SET metadata = jsonb_build_object('job_id', '${job.id}', 'queue_id', 'ingestion')
        WHERE id = '${importId}'
      `);

      return reply.status(201).send({
        data: {
          importId,
          jobId: job.id,
          status: 'queued',
          filename: originalFilename,
          checksum,
          size: totalBytes,
        },
      });
    } catch (err) {
      const error = err as Error;
      return reply.status(500).send({
        error: {
          code: 'UPLOAD_FAILED',
          message: error.message,
        },
      });
    }
  });

  // Get import status
  app.get('/api/v1/imports/:importId', async (request, reply) => {
    const { importId } = request.params as { importId: string };
    const workspaceId = request.user.workspaceId;

    const db = getDb();
    const results = await db.execute(`
      SELECT i.*, 
        jsonb_agg(DISTINCT jsonb_build_object(
          'id', f.id,
          'filename', f.filename,
          'status', f.status,
          'record_count', f.record_count,
          'warnings', f.warnings,
          'errors', f.errors
        )) as files
      FROM imports i
      LEFT JOIN import_files f ON f.import_id = i.id
      WHERE i.id = '${importId}' AND i.workspace_id = '${workspaceId}'
      GROUP BY i.id
    `);

    if (results.length === 0) {
      return reply.status(404).send({
        error: {
          code: 'IMPORT_NOT_FOUND',
          message: 'Import not found',
        },
      });
    }

    const importRecord = results[0];
    
    // Also get job status from BullMQ if available
    const jobId = (importRecord as any).metadata?.job_id;
    let jobStatus = null;
    
    if (jobId) {
      try {
        const job = await ingestionQueue.getJob(jobId as string);
        if (job) {
          const state = await job.getState();
          jobStatus = {
            jobId: job.id,
            state,
            progress: job.progress,
            data: job.data,
            processedOn: job.processedOn,
            finishedOn: job.finishedOn,
            failedReason: job.failedReason,
          };
        }
      } catch {
        // Job may have been cleaned up
      }
    }

    return reply.send({
      data: {
        ...importRecord,
        jobStatus,
      },
    });
  });

  // List imports
  app.get('/api/v1/imports', async (request, reply) => {
    const workspaceId = request.user.workspaceId;
    const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number };

    const db = getDb();
    const offset = (page - 1) * limit;
    
    const countResults = await db.execute(`
      SELECT COUNT(*) as count FROM imports WHERE workspace_id = '${workspaceId}'
    `);
    
    const total = parseInt((countResults[0] as any).count, 10);
    
    const results = await db.execute(`
      SELECT i.*,
        (SELECT COUNT(*) FROM import_files f WHERE f.import_id = i.id) as file_count,
        (SELECT COALESCE(SUM(f.record_count), 0) FROM import_files f WHERE f.import_id = i.id) as total_records
      FROM imports i
      WHERE i.workspace_id = '${workspaceId}'
      ORDER BY i.uploaded_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    return reply.send({
      data: results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

  // Get import summary
  app.get('/api/v1/imports/:importId/summary', async (request, reply) => {
    const { importId } = request.params as { importId: string };
    const workspaceId = request.user.workspaceId;

    const db = getDb();
    
    // Get import record
    const importResults = await db.execute(`
      SELECT * FROM imports WHERE id = '${importId}' AND workspace_id = '${workspaceId}'
    `);

    if (importResults.length === 0) {
      return reply.status(404).send({
        error: {
          code: 'IMPORT_NOT_FOUND',
          message: 'Import not found',
        },
      });
    }

    // Get file statistics
    const filesResults = await db.execute(`
      SELECT * FROM import_files WHERE import_id = '${importId}'
    `);

    // Get entity counts for this workspace
    const [peopleCount, companiesCount, connectionsCount, messagesCount] = await Promise.all([
      db.execute(`SELECT COUNT(*) as count FROM people WHERE workspace_id = '${workspaceId}'`),
      db.execute(`SELECT COUNT(*) as count FROM companies WHERE workspace_id = '${workspaceId}'`),
      db.execute(`SELECT COUNT(*) as count FROM connections WHERE workspace_id = '${workspaceId}'`),
      db.execute(`SELECT COUNT(*) as count FROM messages WHERE workspace_id = '${workspaceId}'`),
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

    const db = getDb();
    
    // Get import to find job ID
    const importResults = await db.execute(`
      SELECT * FROM imports WHERE id = '${importId}' AND workspace_id = '${workspaceId}'
    `);

    if (importResults.length === 0) {
      return reply.status(404).send({
        error: {
          code: 'IMPORT_NOT_FOUND',
          message: 'Import not found',
        },
      });
    }

    const importRecord = importResults[0] as any;
    const jobId = importRecord.metadata?.job_id;

    // Try to remove from queue
    if (jobId) {
      try {
        const job = await ingestionQueue.getJob(jobId as string);
        if (job) {
          await job.remove();
        }
      } catch {
        // Job may have already started or completed
      }
    }

    // Update import status
    await db.execute(`
      UPDATE imports SET 
        status = 'cancelled',
        metadata = jsonb_set(COALESCE(metadata, '{}'), '{cancelled_at}', to_jsonb(NOW()::text))
      WHERE id = '${importId}'
    `);

    return reply.send({
      data: {
        importId,
        status: 'cancelled',
      },
    });
  });

  // Retry failed import
  app.post('/api/v1/imports/:importId/retry', {
    preHandler: [requireRole('owner', 'admin')],
  }, async (request, reply) => {
    const { importId } = request.params as { importId: string };
    const workspaceId = request.user.workspaceId;

    const db = getDb();
    
    // Get import record
    const importResults = await db.execute(`
      SELECT * FROM imports WHERE id = '${importId}' AND workspace_id = '${workspaceId}'
    `);

    if (importResults.length === 0) {
      return reply.status(404).send({
        error: {
          code: 'IMPORT_NOT_FOUND',
          message: 'Import not found',
        },
      });
    }

    const importRecord = importResults[0] as any;
    
    if (importRecord.status !== 'failed') {
      return reply.status(400).send({
        error: {
          code: 'INVALID_STATUS',
          message: 'Only failed imports can be retried',
        },
      });
    }

    // Get file record
    const filesResults = await db.execute(`
      SELECT * FROM import_files WHERE import_id = '${importId}' LIMIT 1
    `);

    if (filesResults.length === 0) {
      return reply.status(400).send({
        error: {
          code: 'NO_FILES',
          message: 'No files found for import',
        },
      });
    }

    const importFile = filesResults[0] as any;
    const archivePath = importFile.s3_key;

    if (!archivePath || !existsSync(archivePath as string)) {
      return reply.status(400).send({
        error: {
          code: 'FILE_MISSING',
          message: 'Archive file no longer available',
        },
      });
    }

    // Reset import status
    await db.execute(`
      UPDATE imports SET 
        status = 'pending',
        metadata = jsonb_set(COALESCE(metadata, '{}'), '{retried_at}', to_jsonb(NOW()::text))
      WHERE id = '${importId}'
    `);

    // Enqueue new job
    const job = await ingestionQueue.add('process-import', {
      importId,
      workspaceId,
      userId: request.user.id,
      archivePath,
      filename: importFile.filename,
      retry: true,
    }, {
      priority: 1,
    });

    // Update import with new job ID
    await db.execute(`
      UPDATE imports SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{job_id}', to_jsonb('${job.id}'))
      WHERE id = '${importId}'
    `);

    return reply.send({
      data: {
        importId,
        jobId: job.id,
        status: 'queued',
      },
    });
  });

  // Delete import
  app.delete('/api/v1/imports/:importId', {
    preHandler: [requireRole('owner')],
  }, async (request, reply) => {
    const { importId } = request.params as { importId: string };
    const workspaceId = request.user.workspaceId;

    const db = getDb();
    
    // Get import record
    const importResults = await db.execute(`
      SELECT * FROM imports WHERE id = '${importId}' AND workspace_id = '${workspaceId}'
    `);

    if (importResults.length === 0) {
      return reply.status(404).send({
        error: {
          code: 'IMPORT_NOT_FOUND',
          message: 'Import not found',
        },
      });
    }

    // Try to remove from queue first
    const importRecord = importResults[0] as any;
    const jobId = importRecord.metadata?.job_id;
    if (jobId) {
      try {
        const job = await ingestionQueue.getJob(jobId as string);
        if (job) {
          await job.remove();
        }
      } catch {
        // Ignore
      }
    }

    // Delete files
    await db.execute(`
      DELETE FROM import_files WHERE import_id = '${importId}'
    `);

    // Delete import
    await db.execute(`
      DELETE FROM imports WHERE id = '${importId}'
    `);

    return reply.status(204).send();
  });
}
