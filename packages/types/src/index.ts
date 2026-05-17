// ═══════════════════════════════════════════════════════
// 📦 @clip-ai/types - Shared TypeScript Definitions
// ═══════════════════════════════════════════════════════

export type { User, UserRole, UserPlan } from './user';
export type { Video, VideoStatus, VideoMetadata } from './video';
export type { Clip, ClipStatus, ClipSettings, ClipExport } from './clip';
export type { Job, JobType, JobStatus, JobPayload, JobResult, JobPayloadMap, JobResultMap } from './job';
export type {
  Transcript,
  TranscriptSegment,
  TranscriptWord,
} from './transcript';
export type {
  Caption,
  CaptionStyle,
  CaptionAnimation,
  CaptionPosition,
} from './caption';
export type { Platform, ExportPreset } from './platform';
export { PLATFORM_PRESETS } from './platform';
export type { ApiResponse, PaginatedResponse, ApiError, ErrorCode } from './api';
