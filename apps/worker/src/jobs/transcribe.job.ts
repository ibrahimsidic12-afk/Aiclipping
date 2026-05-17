import { Job } from 'bullmq';
import { RegoloClient } from '@clip-ai/regolo-client';
import { extractAudio } from '@clip-ai/video-core';
import { downloadToTemp, uploadBuffer } from '../lib/storage.js';
import { logger } from '../lib/logger.js';
import { persistenceService } from '../lib/persistence.js';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { getQueue } from '../queue/client.js';

interface TranscribePayload {
  videoId: string;
  audioStorageKey: string;
  language?: string;
}

interface TranscribeResult {
  transcriptId: string;
  duration: number;
  wordCount: number;
}

/**
 * Transcription Job Processor
 * 
 * Pipeline:
 * 1. Download video from S3
 * 2. Extract audio (mono 16kHz WAV for Whisper)
 * 3. Send to Regolo /audio/transcriptions
 * 4. Store transcript + word-level timestamps
 * 5. Enqueue highlight detection job
 */
export async function processTranscription(
  job: Job<TranscribePayload, TranscribeResult>
): Promise<TranscribeResult> {
  const { videoId, audioStorageKey, language } = job.data;

  logger.info(`Starting transcription for video: ${videoId}`);
  await job.updateProgress(5);

  // Step 1: Download video
  const videoPath = await downloadToTemp(audioStorageKey);
  logger.info(`Downloaded video to: ${videoPath}`);
  await job.updateProgress(15);

  // Step 2: Extract audio as mono 16kHz WAV (optimal for Whisper)
  const audioPath = join(tmpdir(), `clipai-audio-${randomUUID()}.wav`);
  await extractAudio(videoPath, audioPath, {
    sampleRate: 16000,
    mono: true,
    format: 'wav',
  });
  logger.info(`Extracted audio: ${audioPath}`);
  await job.updateProgress(30);

  // Step 3: Transcribe with Regolo
  const regolo = new RegoloClient({
    apiKey: process.env.REGOLO_API_KEY || '',
    baseURL: process.env.REGOLO_BASE_URL,
  });

  const audioBuffer = await readFile(audioPath);
  const transcript = await regolo.transcribe(Buffer.from(audioBuffer), {
    language,
    timestampGranularities: ['word', 'segment'],
  });
  logger.info(`Transcription complete: ${transcript.words?.length || 0} words, ${transcript.duration}s`);
  await job.updateProgress(70);

  // Step 4: Store transcript as JSON in S3
  const transcriptId = randomUUID();
  const transcriptData = {
    id: transcriptId,
    videoId,
    ...transcript,
    model: 'faster-whisper-large-v3',
    processingTime: Date.now() - job.timestamp,
    createdAt: new Date().toISOString(),
  };

  const transcriptKey = `transcripts/${videoId}/${transcriptId}.json`;
  await uploadBuffer(
    Buffer.from(JSON.stringify(transcriptData, null, 2)),
    transcriptKey,
    'application/json'
  );
  await job.updateProgress(85);

  // Step 5: Persist transcript to database
  const wordCount = transcript.words?.length || 0;
  const segmentCount = transcript.segments?.length || 0;
  const fullText = transcript.text || '';

  await persistenceService.createTranscript({
    videoId,
    text: fullText,
    language: language || transcript.language || 'en',
    duration: transcript.duration,
    segmentCount,
    wordCount,
    model: 'faster-whisper-large-v3',
    storageKey: transcriptKey,
    processingTime: Date.now() - job.timestamp,
  });
  await job.updateProgress(90);

  // Step 6: Cleanup temp files
  await Promise.allSettled([unlink(videoPath), unlink(audioPath)]);
  await job.updateProgress(92);

  // Step 7: Enqueue highlight detection (next pipeline step)
  const highlightQueue = getQueue('detect-highlights');
  await highlightQueue.add(
    'detect-highlights',
    {
      videoId,
      transcriptId,
      maxClips: 5,
      targetPlatform: 'all',
    },
    { priority: 2 }
  );

  await job.updateProgress(100);

  logger.info(`Transcription job complete for video: ${videoId}`);

  return {
    transcriptId,
    duration: transcript.duration,
    wordCount: transcript.words?.length || 0,
  };
}
