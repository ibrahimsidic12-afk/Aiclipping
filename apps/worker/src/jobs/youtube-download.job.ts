import { Job } from 'bullmq';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { unlink, stat } from 'fs/promises';
import { uploadFromPath } from '../lib/storage.js';
import { logger } from '../lib/logger.js';

const execAsync = promisify(exec);

interface YouTubeDownloadPayload {
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
}

interface YouTubeDownloadResult {
  videoId: string;
  storageKey: string;
  duration: number;
  title: string;
  fileSize: number;
}

/**
 * YouTube Download & Auto-Clip Job Processor
 *
 * Pipeline:
 * 1. Download video from YouTube using yt-dlp
 * 2. Upload to S3 storage
 * 3. Enqueue transcription job
 * 4. Transcription completes → auto-triggers highlight detection
 * 5. Highlights detected → auto-generates clips
 */
export async function processYouTubeDownload(
  job: Job<YouTubeDownloadPayload, YouTubeDownloadResult>
): Promise<YouTubeDownloadResult> {
  const { importId, videoId, url, youtubeVideoId, settings } = job.data;

  logger.info(`Starting YouTube download for import: ${importId}`, {
    youtubeVideoId,
    url,
  });

  await job.updateProgress(5);

  // Step 1: Get video info (title, duration)
  let title = 'Unknown';
  let duration = 0;

  try {
    const { stdout: infoJson } = await execAsync(
      `yt-dlp --dump-json --no-download "${url}"`,
      { timeout: 30000 }
    );
    const info = JSON.parse(infoJson);
    title = info.title || 'Unknown';
    duration = info.duration || 0;

    logger.info(`Video info: "${title}" (${duration}s)`, { videoId });
  } catch (err) {
    logger.warn('Failed to get video info, proceeding with download', {
      error: (err as Error).message,
    });
  }

  await job.updateProgress(10);

  // Step 2: Download video with yt-dlp
  const tempFilename = `clipai-yt-${randomUUID()}.mp4`;
  const tempPath = join(tmpdir(), tempFilename);

  try {
    const downloadCmd = [
      'yt-dlp',
      '-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"',
      '--merge-output-format mp4',
      `--output "${tempPath}"`,
      '--no-playlist',
      '--max-filesize 2G',
      '--socket-timeout 30',
      `"${url}"`,
    ].join(' ');

    logger.info('Downloading video...', { videoId, command: downloadCmd });
    await execAsync(downloadCmd, { timeout: 600000 }); // 10 min timeout

    await job.updateProgress(50);
  } catch (err) {
    logger.error('yt-dlp download failed', {
      videoId,
      error: (err as Error).message,
    });
    throw new Error(`Download failed: ${(err as Error).message}`);
  }

  // Step 3: Get file size
  const fileStat = await stat(tempPath);
  const fileSize = fileStat.size;

  logger.info(`Download complete: ${(fileSize / (1024 * 1024)).toFixed(1)}MB`, {
    videoId,
  });

  await job.updateProgress(60);

  // Step 4: Upload to S3
  const storageKey = `uploads/${videoId}/original.mp4`;

  try {
    await uploadFromPath(tempPath, storageKey, 'video/mp4');
    logger.info('Uploaded to storage', { videoId, storageKey });
    await job.updateProgress(75);
  } catch (err) {
    logger.error('S3 upload failed', { videoId, error: (err as Error).message });
    throw new Error(`Upload to storage failed: ${(err as Error).message}`);
  } finally {
    // Cleanup temp file
    await unlink(tempPath).catch(() => {});
  }

  // Step 5: Enqueue transcription job (which will auto-trigger highlight detection)
  try {
    const { Queue } = await import('bullmq');
    const { getRedisConnection } = await import('../lib/redis.js');

    const transcribeQueue = new Queue('transcribe', {
      connection: getRedisConnection(),
    });

    await transcribeQueue.add(
      'transcribe',
      {
        videoId,
        audioStorageKey: storageKey,
        language: 'auto',
        // Pass auto-clip settings so highlight detection uses them
        _autoClipSettings: {
          maxClips: settings.maxClips,
          targetPlatform: settings.platform,
          style: settings.style,
          minDuration: settings.minDuration,
          maxDuration: settings.maxDuration,
          autoCaptions: settings.autoCaptions,
          captionStyle: settings.captionStyle,
        },
      },
      { priority: 1 } // High priority for YouTube imports
    );

    await transcribeQueue.close();
    logger.info('Enqueued transcription job', { videoId });
  } catch (err) {
    logger.error('Failed to enqueue transcription', {
      videoId,
      error: (err as Error).message,
    });
  }

  await job.updateProgress(100);

  return {
    videoId,
    storageKey,
    duration,
    title,
    fileSize,
  };
}
