import type { CaptionStyle, CaptionAnimation } from './caption';
import type { Platform } from './platform';

export type ClipStatus =
  | 'suggested'     // AI suggested, not yet approved
  | 'queued'        // User approved, waiting for render
  | 'rendering'     // FFmpeg processing in progress
  | 'rendered'      // Complete, ready for preview
  | 'exported'      // Downloaded or published
  | 'error';

export interface ClipSettings {
  /** Target platform (determines aspect ratio + limits) */
  platform: Platform;
  /** Caption style preset */
  captionStyle: CaptionStyle;
  /** Caption animation type */
  captionAnimation: CaptionAnimation;
  /** Whether to auto-reframe (smart crop) */
  autoReframe: boolean;
  /** Fade in duration (seconds) */
  fadeIn: number;
  /** Fade out duration (seconds) */
  fadeOut: number;
  /** Volume level (0-1) */
  volume: number;
  /** Background music track ID (optional) */
  musicTrackId?: string;
  /** Music volume relative to speech (0-1) */
  musicVolume?: number;
}

export interface ClipExport {
  platform: Platform;
  url: string;
  storageKey: string;
  fileSize: number;
  resolution: string; // e.g., "1080x1920"
  exportedAt: string;
}

export interface Clip {
  id: string;
  videoId: string;
  userId: string;
  /** Start time in source video (seconds) */
  startTime: number;
  /** End time in source video (seconds) */
  endTime: number;
  /** Computed duration */
  duration: number;
  /** AI-generated hook text */
  hookText: string;
  /** Why this clip was suggested */
  reason: string;
  /** Virality score (0-100) */
  viralityScore: number;
  /** Tags/categories */
  tags: string[];
  status: ClipStatus;
  settings: ClipSettings;
  /** Preview URL (low-quality for fast preview) */
  previewUrl?: string;
  /** Final rendered exports */
  exports: ClipExport[];
  /** Render progress (0-100) */
  renderProgress?: number;
  /** Error message if status is 'error' */
  error?: string;
  createdAt: string;
  updatedAt: string;
}
