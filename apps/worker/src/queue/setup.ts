import { Queue, Worker } from 'bullmq';
import { getRedisConnection } from '../lib/redis.js';
import { processTranscription } from '../jobs/transcribe.job.js';
import { processHighlightDetection } from '../jobs/detect-highlights.job.js';
import { processRenderClip } from '../jobs/render-clip.job.js';
import { processCaptionGeneration } from '../jobs/generate-captions.job.js';
import { processFetchSource } from '../jobs/fetch-source.job.js';
import { logger } from '../lib/logger.js';
import { persistenceService } from '../lib/persistence.js';
import { closeAllQueues } from './client.js';

const CONCURRENCY = parseInt(process.env.CONCURRENT_WORKERS || '3', 10);

/**
 * Minimum interval (in ms) between progress updates for a single job.
 * Progress events firing more frequently than this are dropped.
 */
const PROGRESS_THROTTLE_MS = 5000;

/**
 * Tracks the last time a progress update was persisted for each job ID.
 * Entries are cleaned up when a job completes or fails.
 */
const lastProgressUpdate = new Map<string, number>();

export interface QueueMap {
  transcribe: Queue;
  'detect-highlights': Queue;
  'generate-captions': Queue;
  'render-clip': Queue;
  'generate-preview': Queue;
  'fetch-source': Queue;
}

/**
 * Create all job queues with proper settings.
 */
export function createQueues(): QueueMap {
  const connection = getRedisConnection();

  const defaultOpts = {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 5000 },
      removeOnComplete: { count: 100, age: 24 * 3600 }, // Keep last 100 or 24h
      removeOnFail: { count: 500, age: 7 * 24 * 3600 }, // Keep failed for 7 days
    },
  };

  return {
    transcribe: new Queue('transcribe', defaultOpts),
    'detect-highlights': new Queue('detect-highlights', defaultOpts),
    'generate-captions': new Queue('generate-captions', defaultOpts),
    'render-clip': new Queue('render-clip', {
      ...defaultOpts,
      defaultJobOptions: {
        ...defaultOpts.defaultJobOptions,
        attempts: 2, // Rendering is expensive, fewer retries
      },
    }),
    'generate-preview': new Queue('generate-preview', defaultOpts),
    'fetch-source': new Queue('fetch-source', {
      ...defaultOpts,
      defaultJobOptions: {
        ...defaultOpts.defaultJobOptions,
        attempts: 2, // YouTube fetches are bandwidth-heavy
      },
    }),
  };
}

/**
 * Create workers for each queue with appropriate concurrency.
 */
export function createWorkers(): Worker[] {
  const connection = getRedisConnection();
  const workers: Worker[] = [];

  // Transcription worker (CPU-light, Regolo API call)
  workers.push(
    new Worker('transcribe', processTranscription, {
      connection,
      concurrency: CONCURRENCY,
      limiter: { max: 5, duration: 60_000 }, // Max 5 per minute (API rate limit)
    })
  );

  // Highlight detection worker (LLM API call)
  workers.push(
    new Worker('detect-highlights', processHighlightDetection, {
      connection,
      concurrency: CONCURRENCY,
      limiter: { max: 10, duration: 60_000 },
    })
  );

  // Caption generation worker
  workers.push(
    new Worker('generate-captions', processCaptionGeneration, {
      connection,
      concurrency: CONCURRENCY,
    })
  );

  // Render worker (CPU-heavy FFmpeg, lower concurrency)
  workers.push(
    new Worker('render-clip', processRenderClip, {
      connection,
      concurrency: Math.max(1, Math.floor(CONCURRENCY / 2)),
    })
  );

  // Fetch-source worker (bandwidth-bound, low concurrency)
  workers.push(
    new Worker('fetch-source', processFetchSource, {
      connection,
      concurrency: 2,
    })
  );

  // Attach event handlers to all workers
  for (const worker of workers) {
    worker.on('active', (job) => {
      logger.info(`Job started: ${job.name}#${job.id}`, { queue: worker.name });
      persistenceService.onJobStart(job.id!).catch((err) => {
        logger.error(`Failed to persist job start for ${job.id}`, { error: err.message });
      });
    });

    worker.on('completed', (job) => {
      logger.info(`Job completed: ${job.name}#${job.id}`, {
        queue: worker.name,
        duration: Date.now() - (job.processedOn || job.timestamp),
      });
      // Clean up throttle tracking
      lastProgressUpdate.delete(job.id!);
      persistenceService.onJobComplete(job.id!, job.returnvalue).catch((err) => {
        logger.error(`Failed to persist job completion for ${job.id}`, { error: err.message });
      });
    });

    worker.on('failed', (job, err) => {
      logger.error(`Job failed: ${job?.name}#${job?.id}`, {
        queue: worker.name,
        error: err.message,
        attempts: job?.attemptsMade,
      });
      if (job) {
        // Clean up throttle tracking
        lastProgressUpdate.delete(job.id!);
        persistenceService
          .onJobFailed(job.id!, err.message, job.data?.videoId, job.data?.clipId)
          .catch((persistErr) => {
            logger.error(`Failed to persist job failure for ${job.id}`, {
              error: persistErr.message,
            });
          });
      }
    });

    worker.on('progress', (job, progress) => {
      const now = Date.now();
      const lastUpdate = lastProgressUpdate.get(job.id!) ?? 0;

      // Throttle: skip if less than 5 seconds since last persisted update
      if (now - lastUpdate < PROGRESS_THROTTLE_MS) {
        return;
      }

      lastProgressUpdate.set(job.id!, now);

      const progressValue = typeof progress === 'number' ? progress : (progress as any)?.percent ?? 0;
      persistenceService.onJobProgress(job.id!, progressValue).catch((err) => {
        logger.error(`Failed to persist job progress for ${job.id}`, { error: err.message });
      });
    });

    worker.on('error', (err) => {
      logger.error(`Worker error in ${worker.name}`, { error: err.message });
    });
  }

  return workers;
}

/**
 * Graceful shutdown: close all workers and queues.
 */
export async function gracefulShutdown(workers: Worker[], queues: QueueMap): Promise<void> {
  // Close workers first (stop processing)
  await Promise.allSettled(workers.map(w => w.close()));

  // Then close queues (both the worker-side queues defined here and any
  // shared producer queues used inside job processors).
  await Promise.allSettled([
    ...Object.values(queues).map(q => q.close()),
    closeAllQueues(),
  ]);

  // Close Redis
  const redis = getRedisConnection();
  redis.disconnect();
}
