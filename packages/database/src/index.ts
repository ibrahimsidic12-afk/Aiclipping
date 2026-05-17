// ═══════════════════════════════════════════════════════
// 🗄️ @clip-ai/database - Prisma Client Export
// ═══════════════════════════════════════════════════════

export { prisma, db } from './client.js';
export type { PrismaClient } from '@prisma/client';

// Re-export all Prisma-generated types for convenience
export {
  UserPlan,
  VideoStatus,
  ClipStatus,
  Platform,
  YouTubeImportStatus,
  JobType,
  JobStatus,
} from '@prisma/client';

export type {
  User,
  Video,
  Transcript,
  Clip,
  YouTubeImport,
  Job,
} from '@prisma/client';
