import { PrismaClient } from '@prisma/client';

/**
 * Prisma Client singleton for use across the application.
 * 
 * In development, we store the client on globalThis to prevent
 * creating multiple instances during hot-reloading (Next.js dev).
 * 
 * In production, a single instance is created and reused.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Alias for convenience.
 * Usage: import { db } from '@clip-ai/database';
 */
export const db = prisma;
