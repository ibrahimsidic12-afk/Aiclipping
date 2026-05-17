import { Queue } from 'bullmq';
import { getRedisConnection } from '../lib/redis.js';

/**
 * Names of all BullMQ queues. Must stay in sync with the web app's
 * `apps/web/lib/queue.ts`.
 */
export type QueueName =
  | 'transcribe'
  | 'detect-highlights'
  | 'generate-captions'
  | 'render-clip'
  | 'generate-preview'
  | 'fetch-source';

const queues = new Map<QueueName, Queue>();

/**
 * Get a Queue instance by name. Cached per-process so jobs don't
 * spin up a fresh Redis connection per enqueue.
 *
 * The worker's `setup.ts` is the source of truth for default job
 * options when the queue is *consumed*. This helper is for *producing*
 * jobs from inside other job processors (e.g. transcribe → highlights).
 * Default options come from the queue created in setup.ts since
 * BullMQ honors options on the producer side.
 */
export function getQueue(name: QueueName): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, { connection: getRedisConnection() });
    queues.set(name, queue);
  }
  return queue;
}

/**
 * Close all cached queues. Used during graceful shutdown.
 */
export async function closeAllQueues(): Promise<void> {
  await Promise.allSettled(Array.from(queues.values()).map((q) => q.close()));
  queues.clear();
}
