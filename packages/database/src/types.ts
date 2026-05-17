/**
 * Re-exports of Prisma-generated types for convenience.
 *
 * Once `prisma generate` has been run, these types will be available
 * from @prisma/client. This module provides a stable import path
 * so consumers don't need to depend on @prisma/client directly.
 *
 * NOTE: Until `prisma generate` is run, these exports will not resolve.
 * Run `pnpm db:generate` in the database package to generate the client.
 */

export type {
  User,
  Video,
  Clip,
  Transcript,
  Export,
  Job,
} from '@prisma/client';

// Enum re-exports (these are both types and runtime values)
// Note: CaptionStyle and CaptionAnimation are defined in the Prisma schema
// but not used in model fields (they're part of the JSON settings column),
// so Prisma doesn't generate runtime enum objects for them.
export {
  VideoStatus,
  ClipStatus,
  JobStatus,
  JobType,
  Platform,
  UserRole,
  UserPlan,
  VideoSourceType,
} from '@prisma/client';

// CaptionStyle and CaptionAnimation are re-exported as type-only since
// Prisma doesn't generate runtime values for enums only used in JSON fields.
export type { $Enums } from '@prisma/client';

/**
 * CaptionStyle values matching the Prisma schema and @clip-ai/types.
 * Provided as a runtime constant since Prisma doesn't export it.
 */
export const CaptionStyle = {
  bold: 'bold',
  karaoke: 'karaoke',
  minimal: 'minimal',
  gradient: 'gradient',
  outline: 'outline',
} as const;
export type CaptionStyle = (typeof CaptionStyle)[keyof typeof CaptionStyle];

/**
 * CaptionAnimation values matching the Prisma schema and @clip-ai/types.
 * Provided as a runtime constant since Prisma doesn't export it.
 */
export const CaptionAnimation = {
  fade: 'fade',
  pop: 'pop',
  slide: 'slide',
  typewriter: 'typewriter',
  none: 'none',
} as const;
export type CaptionAnimation = (typeof CaptionAnimation)[keyof typeof CaptionAnimation];
