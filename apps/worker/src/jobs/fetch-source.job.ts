import { Job } from 'bullmq';
import { create as createYoutubeDl } from 'youtube-dl-exec';
import { stat, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { prisma, VideoStatus } from '@clip-ai/database';
import { logger } from '../lib/logger.js';
import { uploadFromPath } from '../lib/storage.js';
import { getQueue } from '../queue/client.js';

interface FetchSourcePayload {
  videoId: string;
  sourceUrl: string;
}

interface FetchSourceResult {
  storageKey: string;
  title: string;
  duration: number;
}

interface YoutubeDlMetadata {
  title?: string;
  duration?: number;
  is_live?: boolean;
  was_live?: boolean;
  filesize?: number;
  filesize_approx?: number;
  ext?: string;
  channel?: string;
  uploader?: string;
}

const MAX_DURATION_SECONDS = parseInt(
  process.env.MAX_VIDEO_DURATION_SECONDS || '1800',
  10
);
const MAX_FILE_SIZE_BYTES =
  parseInt(process.env.MAX_FILE_SIZE_MB || '500', 10) * 1024 * 1024;

/**
 * Use the bundled yt-dlp binary that youtube-dl-exec ships in node_modules.
 * Falling back to system path is fine but `create()` lets us pin the binary.
 */
const ytdl = createYoutubeDl(
  process.env.YTDL_BINARY_PATH || 'yt-dlp'
);

/**
 * fetch-source job
 *
 * Pulls a YouTube video with yt-dlp, uploads it to S3 at the same key
 * pattern as direct uploads (`uploads/{videoId}/original.mp4`), flips
 * the Video row to `uploaded`, and chains into the existing transcribe
 * pipeline.
 *
 * Validation order matters — we probe metadata first so we can reject
 * (live streams / too long / too large) before doing the expensive
 * download.
 */
export async function processFetchSource(
  job: Job<FetchSourcePayload, FetchSourceResult>
): Promise<FetchSourceResult> {
  const { videoId, sourceUrl } = job.data;
  logger.info(`Fetching YouTube source for video ${videoId}`, { sourceUrl });

  await markFetching(videoId);
  await job.updateProgress(5);

  // Step 1: Probe metadata (no download yet)
  const metadata = await probeMetadata(sourceUrl);
  await job.updateProgress(15);

  validateMetadata(metadata);

  // Step 2: Update originalName from the probed title so the dashboard
  // shows something readable instead of the raw URL.
  if (metadata.title) {
    await prisma.video.update({
      where: { id: videoId },
      data: { originalName: metadata.title.slice(0, 255) },
    });
  }

  // Step 3: Download to tmp
  const tmpFile = join(tmpdir(), `clipai-yt-${randomUUID()}.mp4`);
  let downloaded = false;
  try {
    logger.info(`Downloading YouTube video to ${tmpFile}`);
    await ytdl(sourceUrl, {
      output: tmpFile,
      format: 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b',
      mergeOutputFormat: 'mp4',
      noPlaylist: true,
      noWarnings: true,
      // Avoid printing huge progress payloads — we update progress at
      // a few discrete checkpoints instead.
      noProgress: true,
      // Don't re-download if the file already exists with the same size.
      noOverwrites: false,
    });
    downloaded = true;
    await job.updateProgress(70);

    // Step 4: Verify the download produced something reasonable.
    const stats = await stat(tmpFile);
    if (stats.size === 0) {
      throw new Error('Downloaded file is empty');
    }
    if (stats.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `Downloaded file is ${Math.round(stats.size / (1024 * 1024))}MB, ` +
          `over the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit`
      );
    }

    // Step 5: Upload to S3 at the canonical upload key.
    const storageKey = `uploads/${videoId}/original.mp4`;
    await uploadFromPath(tmpFile, storageKey, 'video/mp4');
    logger.info(`Uploaded YouTube video to ${storageKey}`, { size: stats.size });
    await job.updateProgress(90);

    // Step 6: Flip Video row from `fetching` → `uploaded` so /process
    // (or in our case, the auto-chained transcribe job below) can run.
    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: VideoStatus.uploaded,
        storageKey,
      },
    });

    // Step 7: Chain into the existing pipeline. Same payload shape that
    // the web app's /process route uses.
    await getQueue('transcribe').add(
      'transcribe',
      {
        videoId,
        audioStorageKey: storageKey,
      },
      { priority: 1 }
    );

    // Move the row to `processing` so the dashboard reflects the next
    // stage immediately.
    await prisma.video.update({
      where: { id: videoId },
      data: { status: VideoStatus.processing },
    });

    await job.updateProgress(100);

    return {
      storageKey,
      title: metadata.title ?? sourceUrl,
      duration: metadata.duration ?? 0,
    };
  } finally {
    if (downloaded) {
      await unlink(tmpFile).catch(() => {
        // Ignore — temp cleanup is best-effort
      });
    }
  }
}

/**
 * Calls `yt-dlp --dump-json --no-playlist <url>` and returns the parsed
 * metadata. Throws a friendly error for the most common failure modes.
 */
async function probeMetadata(url: string): Promise<YoutubeDlMetadata> {
  try {
    const raw = await ytdl(url, {
      dumpSingleJson: true,
      noPlaylist: true,
      noWarnings: true,
      skipDownload: true,
    });

    if (typeof raw === 'string') {
      return JSON.parse(raw) as YoutubeDlMetadata;
    }
    return raw as unknown as YoutubeDlMetadata;
  } catch (err) {
    const message = (err as Error).message || String(err);
    if (/Sign in to confirm|age/i.test(message)) {
      throw new Error('Video is age-restricted and cannot be fetched.');
    }
    if (/private|members[- ]only/i.test(message)) {
      throw new Error('Video is private or members-only.');
    }
    if (/unavailable|removed/i.test(message)) {
      throw new Error('Video is unavailable or has been removed.');
    }
    throw new Error(`Failed to read YouTube metadata: ${message}`);
  }
}

function validateMetadata(meta: YoutubeDlMetadata): void {
  if (meta.is_live || meta.was_live) {
    throw new Error('Live streams are not supported.');
  }
  const duration = meta.duration ?? 0;
  if (duration <= 0) {
    throw new Error('Could not determine video duration.');
  }
  if (duration > MAX_DURATION_SECONDS) {
    throw new Error(
      `Video is ${Math.round(duration / 60)} minutes long. Max allowed is ` +
        `${Math.round(MAX_DURATION_SECONDS / 60)} minutes.`
    );
  }
  const approxSize = meta.filesize ?? meta.filesize_approx ?? 0;
  if (approxSize > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `Video file is ~${Math.round(approxSize / (1024 * 1024))}MB, over the ` +
        `${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit.`
    );
  }
}

async function markFetching(videoId: string): Promise<void> {
  await prisma.video.update({
    where: { id: videoId },
    data: { status: VideoStatus.fetching },
  });
}
