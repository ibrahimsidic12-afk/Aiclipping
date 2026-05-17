import { NextRequest, NextResponse } from 'next/server';
import { db } from '@clip-ai/database';

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
 * Creates records in database and enqueues download job.
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

    // Fetch video info for the title
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtubeVideoId}&format=json`;
    let title = 'YouTube Video';
    let channelName = 'Unknown';
    try {
      const oembedRes = await fetch(oembedUrl);
      if (oembedRes.ok) {
        const oembed = await oembedRes.json();
        title = oembed.title || title;
        channelName = oembed.author_name || channelName;
      }
    } catch {
      // Continue with defaults
    }

    // Create YouTube import record in database
    const youtubeImport = await db.youTubeImport.create({
      data: {
        url,
        youtubeVideoId,
        title,
        channelName,
        thumbnailUrl: `https://img.youtube.com/vi/${youtubeVideoId}/maxresdefault.jpg`,
        status: 'DOWNLOADING',
        clipSettings: settings,
        // TODO: Get real userId from auth session
        userId: 'anonymous',
      },
    });

    // Create a video record that will be populated after download
    const video = await db.video.create({
      data: {
        originalName: `${title}.mp4`,
        storageKey: '', // Will be set by worker after download
        status: 'PROCESSING',
        userId: 'anonymous',
      },
    });

    // Update import with videoId
    await db.youTubeImport.update({
      where: { id: youtubeImport.id },
      data: { videoId: video.id },
    });

    // Create job record
    await db.job.create({
      data: {
        type: 'YOUTUBE_DOWNLOAD',
        status: 'WAITING',
        videoId: video.id,
        payload: {
          importId: youtubeImport.id,
          videoId: video.id,
          url,
          youtubeVideoId,
          settings,
        },
        priority: 1,
      },
    });

    // TODO: Enqueue BullMQ job
    // const downloadQueue = new Queue('youtube-download', { connection: redis });
    // await downloadQueue.add('youtube-download', { ... });

    return NextResponse.json({
      success: true,
      data: {
        importId: youtubeImport.id,
        videoId: video.id,
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
