import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

/**
 * Extract YouTube video ID from various URL formats
 */
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([\w-]+)/,
    /(?:youtube\.com\/shorts\/)([\w-]+)/,
    /(?:youtu\.be\/)([\w-]+)/,
    /(?:youtube\.com\/embed\/)([\w-]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * POST /api/youtube/import
 * Start a YouTube video import and auto-clipping job.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, settings } = body as {
      url: string;
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

    if (!url) {
      return NextResponse.json(
        { success: false, error: { code: 'MISSING_URL', message: 'YouTube URL is required' } },
        { status: 400 }
      );
    }

    const youtubeVideoId = extractVideoId(url);
    if (!youtubeVideoId) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_URL', message: 'Invalid YouTube URL' } },
        { status: 400 }
      );
    }

    const importId = randomUUID();
    const videoId = randomUUID();

    // TODO: In production, enqueue BullMQ job for youtube-download worker
    // const { Queue } = await import('bullmq');
    // const downloadQueue = new Queue('youtube-download', { connection: redis });
    // await downloadQueue.add('youtube-download', {
    //   importId,
    //   videoId,
    //   url,
    //   youtubeVideoId,
    //   settings,
    // });

    // For now, store import state in memory (replace with Redis/DB in production)
    // The worker would: download video → transcribe → detect highlights → generate clips

    return NextResponse.json({
      success: true,
      data: {
        importId,
        videoId,
        status: 'downloading',
        message: 'Video import started. AI will find viral moments automatically.',
      },
    });
  } catch (error) {
    console.error('YouTube import error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to start import' } },
      { status: 500 }
    );
  }
}
