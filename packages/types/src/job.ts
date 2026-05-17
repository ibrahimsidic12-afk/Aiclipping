export type JobType =
  | 'transcribe'
  | 'detect-highlights'
  | 'generate-captions'
  | 'render-clip'
  | 'generate-preview'
  | 'extract-keyframes'
  | 'analyze-keyframes'
  | 'youtube-download'
  | 'auto-clip';

export type JobStatus =
  | 'waiting'
  | 'active'
  | 'completed'
  | 'failed'
  | 'delayed'
  | 'paused';

/** Payloads for each job type */
export interface JobPayloadMap {
  'transcribe': {
    videoId: string;
    audioStorageKey: string;
    language?: string;
  };
  'detect-highlights': {
    videoId: string;
    transcriptId: string;
    maxClips?: number;
    targetPlatform?: string;
    criteria?: string;
  };
  'generate-captions': {
    clipId: string;
    transcriptId: string;
    style: string;
  };
  'render-clip': {
    clipId: string;
    videoStorageKey: string;
    subtitleStorageKey?: string;
    preset: string;
  };
  'generate-preview': {
    clipId: string;
    videoStorageKey: string;
  };
  'extract-keyframes': {
    videoId: string;
    videoStorageKey: string;
    interval?: number;
    maxFrames?: number;
  };
  'analyze-keyframes': {
    videoId: string;
    frameStorageKeys: string[];
    transcript: string;
  };
  'youtube-download': {
    importId: string;
    videoId: string;
    url: string;
    youtubeVideoId: string;
    settings: {
      platform: string;
      maxClips: number;
      minDuration: number;
      maxDuration: number;
      style: string;
      autoCaptions: boolean;
      captionStyle: string;
    };
  };
  'auto-clip': {
    videoId: string;
    transcriptId: string;
    videoStorageKey: string;
    settings: {
      maxClips: number;
      targetPlatform: string;
      style: string;
      minDuration: number;
      maxDuration: number;
      autoCaptions: boolean;
      captionStyle: string;
    };
  };
}

export type JobPayload = JobPayloadMap[JobType];

export interface JobResultMap {
  'transcribe': {
    transcriptId: string;
    duration: number;
    wordCount: number;
  };
  'detect-highlights': {
    clipIds: string[];
    count: number;
  };
  'generate-captions': {
    subtitleStorageKey: string;
    format: string;
  };
  'render-clip': {
    outputStorageKey: string;
    fileSize: number;
    duration: number;
  };
  'generate-preview': {
    previewUrl: string;
    fileSize: number;
  };
  'extract-keyframes': {
    frameStorageKeys: string[];
    count: number;
  };
  'analyze-keyframes': {
    frames: Array<{
      timestamp: number;
      description: string;
      engagementScore: number;
    }>;
  };
  'youtube-download': {
    videoId: string;
    storageKey: string;
    duration: number;
    title: string;
    fileSize: number;
  };
  'auto-clip': {
    clipIds: string[];
    count: number;
    clips: Array<{
      id: string;
      startTime: number;
      endTime: number;
      title: string;
      hookText: string;
      viralityScore: number;
      tags: string[];
    }>;
  };
}

export type JobResult = JobResultMap[JobType];

export interface Job<T extends JobType = JobType> {
  id: string;
  type: T;
  status: JobStatus;
  payload: JobPayloadMap[T];
  result?: JobResultMap[T];
  error?: string;
  /** Number of retry attempts */
  attempts: number;
  /** Max retry attempts */
  maxAttempts: number;
  /** Progress (0-100) */
  progress: number;
  /** Priority (lower = higher priority) */
  priority: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}
