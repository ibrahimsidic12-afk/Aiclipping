import IORedis from 'ioredis';

/**
 * Redis connection singleton for the web app.
 *
 * Vercel keeps the Node process alive across warm invocations, so the
 * connection survives between requests. We attach to globalThis so
 * Next.js HMR in dev doesn't leak connections.
 */
const globalForRedis = globalThis as unknown as {
  __redis: IORedis | undefined;
};

export function getRedisConnection(): IORedis {
  if (!globalForRedis.__redis) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error(
        '[redis] REDIS_URL is not set. Cannot enqueue jobs without Redis.'
      );
    }

    globalForRedis.__redis = new IORedis(url, {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
      retryStrategy(times) {
        return Math.min(times * 200, 5000);
      },
    });

    globalForRedis.__redis.on('error', (err) => {
      console.error('[redis] connection error:', err.message);
    });
  }

  return globalForRedis.__redis;
}
