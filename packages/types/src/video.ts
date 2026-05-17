export type VideoStatus =
  | 'uploading'
  | 'uploaded'
  | 'fetching'
  | 'processing'
  | 'transcribing'
  | 'analyzing'
  | 'ready'
  | 'error';

export type VideoSourceType = 'upload' | 'youtube';

export interface VideoMetadata {
  duration: number; // seconds
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  codec: string;
  audioCodec: string;
  fileSize: number; // bytes
  format: string;
}

export interface Video {
  id: string;
  userId: string;
  /** Original filename */
  originalName: string;
  /** S3/storage key */
  storageKey: string;
  /** CDN-accessible URL (presigned or public) */
  url?: string;
  /** Thumbnail URL */
  thumbnailUrl?: string;
  status: VideoStatus;
  sourceType?: VideoSourceType;
  /** Original URL when sourceType is "youtube" */
  sourceUrl?: string;
  metadata?: VideoMetadata;
  /** Transcript ID once transcription completes */
  transcriptId?: string;
  /** Error message if status is 'error' */
  error?: string;
  /** Tags for organization */
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
