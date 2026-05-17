import { Queue } from 'bullmq';
import { getRedisConnection } from './redis';

/**
 * Names of all BullMQ queues. Must match the worker's queue names in
 * `apps/worker/src/queue/setup.ts`.
 */
export type QueueName =
  | 'transcribe'
  | 'detect-highlights'
  | 'generate-captions'
  | 'render-clip'
  | 'generate-preview'
  | 'fetch-source';

/**
 * Per-queue Queue instances cached on globalThis to survive HMR.
 * Each Queue holds its own pool of Redis connections; reusing them
 * across requests is much cheaper than constructing one per request.
 */
const globalForQueues = globalThis as unknown as {
  __queues: Map<QueueName, Queue> | undefined;
};

function getQueueMap(): Map<QueueName, Queue> {
  if (!globalForQueues.__queues) {
    globalForQueues.__queues = new Map();
  }
  return globalForQueues.__queues;
}

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: { count: 100, age: 24 * 3600 },
  removeOnFail: { count: 500, age: 7 * 24 * 3600 },
};

const RENDER_JOB_OPTIONS = {
  ...DEFAULT_JOB_OPTIONS,
  attempts: 2, // Rendering is expensive; matches worker setup
};

/**
 * Get a Queue instance by name. Creates and caches on first access.
 */
export function getQueue(name: QueueName): Queue {
  const map = getQueueMap();
  let queue = map.get(name);
  if (!queue) {
    const opts = name === 'render-clip' ? RENDER_JOB_OPTIONS : DEFAULT_JOB_OPTIONS;
    queue = new Queue(name, {
      connection: getRedisConnection(),
      defaultJobOptions: opts,
    });
    map.set(name, queue);
  }
  return queue;
}

/**
 * Enqueue a job, using the provided `dbJobId` as the BullMQ job ID so
 * worker lifecycle events update the same Job row in Postgres.
 */
export async function enqueueJob<T extends object>(
  queueName: QueueName,
  jobName: string,
  data: T,
  options: { dbJobId?: string; priority?: number } = {}
): Promise<void> {
  const queue = getQueue(queueName);
  await queue.add(jobName, data, {
    jobId: options.dbJobId,
    priority: options.priority,
  });
}
