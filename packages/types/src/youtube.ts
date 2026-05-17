export type YouTubeImportStatus =
  | 'pending'
  | 'downloading'
  | 'downloaded'
  | 'processing'
  | 'clipping'
  | 'completed'
  | 'error';

export interface YouTubeImport {
  id: string;
  userId: string;
  /** Original YouTube URL */
  url: string;
  /** Extracted YouTube video ID */
  youtubeVideoId: string;
  /** Video title from YouTube */
  title: string;
  /** Video duration in seconds */
  duration: number;
  /** Thumbnail URL from YouTube */
  thumbnailUrl: string;
  /** Channel name */
  channelName: string;
  /** Internal video ID once downloaded */
  videoId?: string;
  /** Storage key for downloaded video */
  storageKey?: string;
  /** Processing status */
  status: YouTubeImportStatus;
  /** Error message if failed */
  error?: string;
  /** Auto-clip settings */
  clipSettings: AutoClipSettings;
  /** Generated clip IDs */
  clipIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AutoClipSettings {
  /** Target platform for optimal format */
  platform: 'tiktok' | 'reels' | 'shorts' | 'all';
  /** Maximum number of clips to generate */
  maxClips: number;
  /** Min clip duration in seconds */
  minDuration: number;
  /** Max clip duration in seconds */
  maxDuration: number;
  /** Style of detection: viral moments, highlights, or educational */
  style: 'viral' | 'highlights' | 'educational' | 'funny';
  /** Whether to add captions automatically */
  autoCaptions: boolean;
  /** Caption style */
  captionStyle: 'bold' | 'minimal' | 'karaoke' | 'outline';
}

export interface YouTubeVideoInfo {
  id: string;
  title: string;
  duration: number;
  thumbnailUrl: string;
  channelName: string;
  viewCount: number;
  description: string;
}
