import { Job } from 'bullmq';
import { RegoloClient } from '@clip-ai/regolo-client';
import { downloadToTemp } from '../lib/storage.js';
import { logger } from '../lib/logger.js';
import { persistenceService } from '../lib/persistence.js';
import { prisma } from '@clip-ai/database';
import { readFile } from 'fs/promises';
import { getQueue } from '../queue/client.js';

interface HighlightPayload {
  videoId: string;
  transcriptId: string;
  maxClips?: number;
  targetPlatform?: string;
  criteria?: string;
}

interface HighlightResult {
  clipIds: string[];
  count: number;
}

/**
 * Highlight Detection Job Processor
 * 
 * Pipeline:
 * 1. Load transcript from storage
 * 2. Send to Regolo LLM for highlight analysis
 * 3. Score and rank clip candidates
 * 4. Persist clip suggestions to database
 * 5. Enqueue caption generation for each clip
 */
export async function processHighlightDetection(
  job: Job<HighlightPayload, HighlightResult>
): Promise<HighlightResult> {
  const { videoId, transcriptId, maxClips = 5, targetPlatform = 'all', criteria } = job.data;

  logger.info(`Starting highlight detection for video: ${videoId}`);
  await job.updateProgress(10);

  // Step 1: Load transcript
  const transcriptKey = `transcripts/${videoId}/${transcriptId}.json`;
  const transcriptPath = await downloadToTemp(transcriptKey, 'json');
  const transcriptData = JSON.parse(await readFile(transcriptPath, 'utf-8'));
  await job.updateProgress(20);

  // Step 2: Analyze with Regolo LLM
  const regolo = new RegoloClient({
    apiKey: process.env.REGOLO_API_KEY || '',
    baseURL: process.env.REGOLO_BASE_URL,
  });

  const highlights = await regolo.detectHighlights(
    transcriptData.text,
    transcriptData.duration,
    {
      maxClips,
      targetPlatform: targetPlatform as 'tiktok' | 'reels' | 'shorts' | 'all',
      criteria,
      minDuration: 15,
      maxDuration: 90,
    }
  );
  await job.updateProgress(70);

  logger.info(`Found ${highlights.clips.length} highlight candidates`, {
    videoId,
    processingTime: highlights.processingTime,
    topScore: highlights.clips[0]?.viralityScore,
  });

  // Step 3: Fetch the video's userId for clip ownership
  const video = await prisma.video.findUniqueOrThrow({
    where: { id: videoId },
    select: { userId: true },
  });

  // Step 4: Persist clip suggestions to database
  const clipIds = await persistenceService.createClips({
    videoId,
    userId: video.userId,
    clips: highlights.clips.map((clip) => ({
      startTime: clip.startTime,
      endTime: clip.endTime,
      duration: clip.duration,
      hookText: clip.hookText,
      reason: clip.reason,
      viralityScore: clip.viralityScore,
      tags: clip.tags,
      settings: {},
    })),
  });

  await job.updateProgress(90);

  // Step 5: Enqueue caption generation for each clip via the shared queue
  // singleton (don't construct a new Queue per call).
  const captionQueue = getQueue('generate-captions');
  for (const clipId of clipIds) {
    await captionQueue.add(
      'generate-captions',
      {
        clipId,
        transcriptId,
        videoId,
        style: 'bold', // Default style
      },
      { priority: 3 }
    );
  }

  await job.updateProgress(100);

  return { clipIds, count: clipIds.length };
}
