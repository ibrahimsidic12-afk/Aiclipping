import { Queue, Worker } from 'bullmq';
import { getRedisConnection } from '../lib/redis.js';
import { processTranscription } from '../jobs/transcribe.job.js';
import { processHighlightDetection } from '../jobs/detect-highlights.job.js';
import { processRenderClip } from '../jobs/render-clip.job.js';
import { processCaptionGeneration } from '../jobs/generate-captions.job.js';
import { processYouTubeDownload } from '../jobs/youtube-download.job.js';
import { processAutoClip } from '../jobs/auto-clip.job.js';
import { logger } from '../lib/logger.js';
import type { JobType } from '@clip-ai/types';

const CONCURRENCY = parseInt(process.env.CONCURRENT_WORKERS || '3', 10);

export interface QueueMap {
  transcribe: Queue;
  'detect-highlights': Queue;
  'generate-captions': Queue;
  'render-clip': Queue;
  'generate-preview': Queue;
  'youtube-download': Queue;
  'auto-clip': Queue;
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
    'youtube-download': new Queue('youtube-download', {
      ...defaultOpts,
      defaultJobOptions: {
        ...defaultOpts.defaultJobOptions,
        attempts: 2,
        backoff: { type: 'exponential' as const, delay: 10000 },
      },
    }),
    'auto-clip': new Queue('auto-clip', defaultOpts),
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

  // YouTube download worker (network-heavy, limited concurrency)
  workers.push(
    new Worker('youtube-download', processYouTubeDownload, {
      connection,
      concurrency: 2, // Limit concurrent downloads
      limiter: { max: 3, duration: 60_000 }, // Max 3 per minute
    })
  );

  // Auto-clip worker (LLM API call + queue management)
  workers.push(
    new Worker('auto-clip', processAutoClip, {
      connection,
      concurrency: CONCURRENCY,
      limiter: { max: 5, duration: 60_000 },
    })
  );

  // Attach event handlers to all workers
  for (const worker of workers) {
    worker.on('completed', (job) => {
      logger.info(`Job completed: ${job.name}#${job.id}`, {
        queue: worker.name,
        duration: Date.now() - (job.processedOn || job.timestamp),
      });
    });

    worker.on('failed', (job, err) => {
      logger.error(`Job failed: ${job?.name}#${job?.id}`, {
        queue: worker.name,
        error: err.message,
        attempts: job?.attemptsMade,
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

  // Then close queues
  await Promise.allSettled(Object.values(queues).map(q => q.close()));

  // Close Redis
  const redis = getRedisConnection();
  redis.disconnect();
}
