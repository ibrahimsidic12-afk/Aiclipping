import { Job } from 'bullmq';
import { generateASS, splitIntoLines } from '@clip-ai/video-core';
import { downloadToTemp, uploadBuffer } from '../lib/storage.js';
import { logger } from '../lib/logger.js';
import { readFile, unlink } from 'fs/promises';
import { prisma } from '@clip-ai/database';
import { getQueue } from '../queue/client.js';

interface CaptionPayload {
  clipId: string;
  transcriptId: string;
  videoId: string;
  style: string;
}

interface CaptionResult {
  subtitleStorageKey: string;
  format: string;
}

/**
 * Caption Generation Job Processor
 * 
 * Pipeline:
 * 1. Load transcript with word-level timestamps
 * 2. Split words into display lines (max N words per line)
 * 3. Optionally enhance with Regolo LLM for styling decisions
 * 4. Generate ASS subtitle file with animated styles
 * 5. Upload subtitle file to S3
 */
export async function processCaptionGeneration(
  job: Job<CaptionPayload, CaptionResult>
): Promise<CaptionResult> {
  const { clipId, transcriptId, videoId, style } = job.data;

  logger.info(`Generating captions for clip: ${clipId}`);
  await job.updateProgress(10);

  // Step 1: Load transcript using the exact storage key (no globs — S3 doesn't support them)
  const transcriptKey = `transcripts/${videoId}/${transcriptId}.json`;
  const transcriptPath = await downloadToTemp(transcriptKey, 'json');
  const transcriptData = JSON.parse(await readFile(transcriptPath, 'utf-8'));
  await job.updateProgress(20);

  const words = transcriptData.words || [];

  if (words.length === 0) {
    logger.warn(`No word-level data available for transcript: ${transcriptId}`);
    return { subtitleStorageKey: '', format: 'none' };
  }

  // Step 2: Split into display lines
  const maxWordsPerLine = style === 'minimal' ? 6 : 4;
  const lines = splitIntoLines(
    words.map((w: { word: string; start: number; end: number }) => ({
      word: w.word,
      start: w.start,
      end: w.end,
    })),
    maxWordsPerLine
  );
  await job.updateProgress(40);

  logger.info(`Split transcript into ${lines.length} caption lines`);

  // Step 3: Generate ASS file with style
  const assContent = generateASS(
    lines.map(line => ({
      startTime: line.startTime,
      endTime: line.endTime,
      text: line.text,
      words: line.words.map(w => ({
        word: w.word,
        startTime: w.start,
        endTime: w.end,
      })),
    })),
    getASSOptions(style)
  );
  await job.updateProgress(70);

  // Step 4: Upload to S3
  const subtitleKey = `captions/${clipId}/${style}.ass`;
  await uploadBuffer(
    Buffer.from(assContent, 'utf-8'),
    subtitleKey,
    'text/plain'
  );
  await job.updateProgress(90);

  // Cleanup
  await unlink(transcriptPath).catch(() => {});

  // Step 5: Auto-enqueue a default render so the pipeline produces a
  // playable clip without requiring the user to click Export. The user
  // can later re-export with different settings via /api/videos/:id/export.
  try {
    const clip = await prisma.clip.findUnique({
      where: { id: clipId },
      include: {
        video: { select: { storageKey: true } },
      },
    });

    if (clip && clip.video?.storageKey) {
      const renderQueue = getQueue('render-clip');
      const platform = 'tiktok';
      const presetKey = 'tiktok-1080';
      await renderQueue.add(
        'render-clip',
        {
          clipId: clip.id,
          videoId: clip.videoId,
          videoStorageKey: clip.video.storageKey,
          subtitleStorageKey: subtitleKey,
          preset: presetKey,
          platform,
          startTime: clip.startTime,
          endTime: clip.endTime,
        },
        { priority: 5 }
      );
      logger.info(`Enqueued auto-render for clip ${clipId}`, { platform });
    } else {
      logger.warn(`Skipping auto-render — clip ${clipId} or its video missing`);
    }
  } catch (err) {
    // Auto-render is best-effort. If it fails, the user can still
    // export manually via the editor.
    logger.warn(`Failed to auto-enqueue render for clip ${clipId}`, {
      error: (err as Error).message,
    });
  }

  await job.updateProgress(100);

  logger.info(`Captions generated for clip: ${clipId}`, { style, lines: lines.length });

  return {
    subtitleStorageKey: subtitleKey,
    format: 'ass',
  };
}

function getASSOptions(style: string) {
  switch (style) {
    case 'karaoke':
      return {
        fontName: 'Arial Black',
        fontSize: 22,
        primaryColor: '&H00FFFFFF&',
        outlineColor: '&H00000000&',
        outline: 3,
        alignment: 2,
        marginV: 60,
        bold: true,
        animateWords: true,
      };
    case 'minimal':
      return {
        fontName: 'Inter',
        fontSize: 16,
        primaryColor: '&H00FFFFFF&',
        outlineColor: '&H80000000&',
        outline: 1,
        shadow: 0,
        alignment: 2,
        marginV: 30,
        bold: false,
        animateWords: false,
      };
    case 'gradient':
      return {
        fontName: 'Arial Black',
        fontSize: 20,
        primaryColor: '&H00FFD700&', // Gold
        outlineColor: '&H00000000&',
        outline: 2,
        alignment: 5, // Center
        marginV: 0,
        bold: true,
        animateWords: false,
      };
    case 'bold':
    default:
      return {
        fontName: 'Arial Black',
        fontSize: 24,
        primaryColor: '&H00FFFFFF&',
        outlineColor: '&H00000000&',
        outline: 4,
        alignment: 2,
        marginV: 50,
        bold: true,
        animateWords: false,
      };
  }
}
