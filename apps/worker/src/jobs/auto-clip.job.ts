import { Job } from 'bullmq';
import { RegoloClient } from '@clip-ai/regolo-client';
import { downloadToTemp } from '../lib/storage.js';
import { logger } from '../lib/logger.js';
import { readFile } from 'fs/promises';

interface AutoClipPayload {
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
}

interface AutoClipResult {
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
}

/**
 * Auto-Clip Job Processor
 *
 * Automatically finds viral/highlight moments and generates clips.
 * This is the full pipeline job that:
 * 1. Loads transcript
 * 2. Uses AI to find the best clip-worthy moments
 * 3. Scores them by virality potential
 * 4. Enqueues render jobs for each clip
 */
export async function processAutoClip(
  job: Job<AutoClipPayload, AutoClipResult>
): Promise<AutoClipResult> {
  const { videoId, transcriptId, videoStorageKey, settings } = job.data;

  logger.info(`Starting auto-clip for video: ${videoId}`, {
    platform: settings.targetPlatform,
    style: settings.style,
    maxClips: settings.maxClips,
  });

  await job.updateProgress(10);

  // Step 1: Load transcript
  const transcriptKey = `transcripts/${videoId}/${transcriptId}.json`;
  const transcriptPath = await downloadToTemp(transcriptKey, 'json');
  const transcriptData = JSON.parse(await readFile(transcriptPath, 'utf-8'));
  await job.updateProgress(20);

  // Step 2: Use Regolo LLM to find viral moments
  const regolo = new RegoloClient({
    apiKey: process.env.REGOLO_API_KEY || '',
    baseURL: process.env.REGOLO_BASE_URL,
  });

  // Build style-specific criteria for the AI
  const styleCriteria: Record<string, string> = {
    viral: 'Find the most shareable, attention-grabbing moments that would go viral on social media. Look for surprising statements, emotional peaks, controversial takes, or highly relatable content.',
    highlights: 'Find the key moments and most important points. Look for main arguments, conclusions, demonstrations, or pivotal moments in the narrative.',
    educational: 'Find clear, informative segments that teach something valuable. Look for explanations, tips, demonstrations, or insightful observations that stand alone.',
    funny: 'Find the funniest, most entertaining moments. Look for jokes, unexpected reactions, witty comments, awkward situations, or comedic timing.',
  };

  const criteria = styleCriteria[settings.style] || styleCriteria.viral;

  const highlights = await regolo.detectHighlights(
    transcriptData.text,
    transcriptData.duration,
    {
      maxClips: settings.maxClips,
      targetPlatform: settings.targetPlatform as 'tiktok' | 'reels' | 'shorts' | 'all',
      criteria,
      minDuration: settings.minDuration,
      maxDuration: settings.maxDuration,
    }
  );
  await job.updateProgress(60);

  logger.info(`Found ${highlights.clips.length} auto-clip candidates`, {
    videoId,
    style: settings.style,
    topScore: highlights.clips[0]?.viralityScore,
  });

  // Step 3: Create clip records and enqueue render/caption jobs
  const { Queue } = await import('bullmq');
  const { getRedisConnection } = await import('../lib/redis.js');
  const connection = getRedisConnection();

  const renderQueue = new Queue('render-clip', { connection });
  const captionQueue = new Queue('generate-captions', { connection });

  const clips = highlights.clips.map((clip, index) => {
    const clipId = `clip-${videoId.slice(0, 8)}-${index}`;

    logger.info(`Auto-clip ${index + 1}: "${clip.hookText}"`, {
      start: clip.startTime,
      end: clip.endTime,
      score: clip.viralityScore,
      tags: clip.tags,
    });

    return {
      id: clipId,
      startTime: clip.startTime,
      endTime: clip.endTime,
      title: clip.hookText,
      hookText: clip.hookText,
      viralityScore: clip.viralityScore,
      tags: clip.tags,
    };
  });

  await job.updateProgress(70);

  // Enqueue caption generation for each clip (if auto captions enabled)
  if (settings.autoCaptions) {
    for (const clip of clips) {
      await captionQueue.add(
        'generate-captions',
        {
          clipId: clip.id,
          transcriptId,
          style: settings.captionStyle,
        },
        { priority: 2 }
      );
    }
  }

  await job.updateProgress(85);

  // Enqueue render jobs for each clip
  for (const clip of clips) {
    await renderQueue.add(
      'render-clip',
      {
        clipId: clip.id,
        videoStorageKey,
        subtitleStorageKey: settings.autoCaptions
          ? `captions/${clip.id}/subtitles.ass`
          : undefined,
        preset: settings.targetPlatform,
        startTime: clip.startTime,
        endTime: clip.endTime,
      },
      { priority: 2 }
    );
  }

  await renderQueue.close();
  await captionQueue.close();
  await job.updateProgress(100);

  const clipIds = clips.map((c) => c.id);

  logger.info(`Auto-clip complete: ${clipIds.length} clips queued for rendering`, {
    videoId,
  });

  return { clipIds, count: clipIds.length, clips };
}
