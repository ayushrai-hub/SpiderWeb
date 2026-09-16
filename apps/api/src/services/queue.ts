import { Queue } from "bullmq";

// Queue configuration
const QUEUE_CONFIG = {
  connection: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6380', 10),
  },
};

const QUEUE_NAMES = [
  'ingestion',
  'embedding',
  'analytics',
  'enrichment',
  'alerts',
  'normalization',
  'entity-resolution',
  'insights',
] as const;

type QueueName = (typeof QUEUE_NAMES)[number];

// Create queue instances
const queues: Record<QueueName, Queue> = {} as any;

for (const name of QUEUE_NAMES) {
  queues[name] = new Queue(name, QUEUE_CONFIG);
}

// Get queue statistics
export async function getQueueStats() {
  const stats: Record<string, any> = {};

  for (const queueName of QUEUE_NAMES) {
    const queue = queues[queueName];
    
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);

      stats[queueName] = {
        waiting,
        active,
        completed,
        failed,
        delayed,
        total: waiting + active + completed + failed + delayed,
      };
    } catch (err) {
      stats[queueName] = {
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  return stats;
}

// Schedule recurring jobs
export async function scheduleRecurringJobs() {
  const scheduled: string[] = [];

  try {
    // Analytics refresh - every hour
    const analyticsQueue = queues.analytics;
    await analyticsQueue.add(
      'refresh-analytics',
      { type: 'full-refresh' },
      {
        repeat: {
          every: 60 * 60 * 1000, // 1 hour
        },
        jobId: 'analytics-refresh-hourly',
      }
    );
    scheduled.push('analytics-refresh-hourly');

    // Entity resolution - every 6 hours
    const enrichmentQueue = queues.enrichment;
    await enrichmentQueue.add(
      'resolve-entities',
      { type: 'full-resolution' },
      {
        repeat: {
          every: 6 * 60 * 60 * 1000, // 6 hours
        },
        jobId: 'entity-resolution-6h',
      }
    );
    scheduled.push('entity-resolution-6h');

    // Embedding generation - every 12 hours
    const embeddingQueue = queues.embedding;
    await embeddingQueue.add(
      'generate-embeddings',
      { type: 'incremental' },
      {
        repeat: {
          every: 12 * 60 * 60 * 1000, // 12 hours
        },
        jobId: 'embedding-generation-12h',
      }
    );
    scheduled.push('embedding-generation-12h');

    // Alert evaluation - every 5 minutes
    const alertsQueue = queues.alerts;
    await alertsQueue.add(
      'evaluate-alerts',
      { type: 'scheduled' },
      {
        repeat: {
          every: 5 * 60 * 1000, // 5 minutes
        },
        jobId: 'alert-evaluation-5m',
      }
    );
    scheduled.push('alert-evaluation-5m');

    console.log(`[Queue] Scheduled ${scheduled.length} recurring jobs`);
  } catch (err) {
    console.error('[Queue] Failed to schedule recurring jobs:', err);
  }

  return { scheduled };
}

// Clean old jobs
export async function cleanOldJobs() {
  let totalCleaned = 0;
  const results: Record<string, number> = {};

  try {
    for (const queueName of QUEUE_NAMES) {
      const queue = queues[queueName];
      
      // Clean completed jobs older than 7 days
      const cleanedCompleted = await queue.clean(7 * 24 * 60 * 60 * 1000, 100, 'completed');
      
      // Clean failed jobs older than 30 days
      const cleanedFailed = await queue.clean(30 * 24 * 60 * 60 * 1000, 100, 'failed');
      
      // Clean active jobs older than 24 hours (stalled)
      const cleanedActive = await queue.clean(24 * 60 * 60 * 1000, 100, 'active');
      
      const queueCleaned = cleanedCompleted.length + cleanedFailed.length + cleanedActive.length;
      results[queueName] = queueCleaned;
      totalCleaned += queueCleaned;
    }

    console.log(`[Queue] Cleaned ${totalCleaned} old jobs`);
  } catch (err) {
    console.error('[Queue] Failed to clean old jobs:', err);
  }

  return { cleaned: totalCleaned, details: results };
}

// Get job details
export async function getJobDetails(queueName: string, jobId: string) {
  const queue = queues[queueName as QueueName];
  if (!queue) {
    throw new Error(`Unknown queue: ${queueName}`);
  }

  const job = await queue.getJob(jobId);
  if (!job) {
    return null;
  }

  const state = await job.getState();
  
  return {
    id: job.id,
    queueName,
    state,
    data: job.data,
    progress: job.progress,
    attemptsMade: job.attemptsMade,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    failedReason: job.failedReason,
    opts: job.opts,
  };
}

// Retry a failed job
export async function retryJob(queueName: string, jobId: string) {
  const queue = queues[queueName as QueueName];
  if (!queue) {
    throw new Error(`Unknown queue: ${queueName}`);
  }

  const job = await queue.getJob(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  await job.retry();
  return { retried: true, jobId };
}

// Remove a job
export async function removeJob(queueName: string, jobId: string) {
  const queue = queues[queueName as QueueName];
  if (!queue) {
    throw new Error(`Unknown queue: ${queueName}`);
  }

  const job = await queue.getJob(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  await job.remove();
  return { removed: true, jobId };
}

// Pause a queue
export async function pauseQueue(queueName: string) {
  const queue = queues[queueName as QueueName];
  if (!queue) {
    throw new Error(`Unknown queue: ${queueName}`);
  }

  await queue.pause();
  return { paused: true, queueName };
}

// Resume a queue
export async function resumeQueue(queueName: string) {
  const queue = queues[queueName as QueueName];
  if (!queue) {
    throw new Error(`Unknown queue: ${queueName}`);
  }

  await queue.resume();
  return { resumed: true, queueName };
}

// Get queue health
export async function getQueueHealth() {
  const health: Record<string, any> = {};

  for (const queueName of QUEUE_NAMES) {
    const queue = queues[queueName];
    
    try {
      const isPaused = await queue.isPaused();
      const counts = await queue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed'
      );
      
      health[queueName] = {
        status: isPaused ? 'paused' : 'healthy',
        ...counts,
      };
    } catch (err) {
      health[queueName] = {
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  return health;
}

// Graceful shutdown
export async function closeQueues() {
  await Promise.all(
    Object.values(queues).map((queue) => queue.close())
  );
}

// Initialize on import
export async function initializeQueues() {
  // Schedule recurring jobs
  await scheduleRecurringJobs();
  
  console.log(`[Queue] Initialized ${QUEUE_NAMES.length} queues`);
}
