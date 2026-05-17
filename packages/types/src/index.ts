// ═══════════════════════════════════════════════════════
// 📦 @clip-ai/types - Shared TypeScript Definitions
// ═══════════════════════════════════════════════════════

export type { User, UserRole, UserPlan } from './user.js';
export type { Video, VideoStatus, VideoMetadata } from './video.js';
export type { Clip, ClipStatus, ClipSettings, ClipExport } from './clip.js';
export type { Job, JobType, JobStatus, JobPayload, JobResult } from './job.js';
export type {
  Transcript,
  TranscriptSegment,
  TranscriptWord,
} from './transcript.js';
export type {
  Caption,
  CaptionStyle,
  CaptionAnimation,
  CaptionPosition,
} from './caption.js';
export type { Platform, ExportPreset } from './platform.js';
export type { ApiResponse, PaginatedResponse, ApiError } from './api.js';
export type {
  YouTubeImport,
  YouTubeImportStatus,
  AutoClipSettings,
  YouTubeVideoInfo,
} from './youtube.js';
