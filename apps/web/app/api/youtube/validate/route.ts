import { NextRequest, NextResponse } from 'next/server';

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
 * POST /api/youtube/validate
 * Validate a YouTube URL and fetch video metadata.
 */
export async function POST(request: NextRequest) {
  try {
    const { url } = (await request.json()) as { url: string };

    if (!url) {
      return NextResponse.json(
        { success: false, error: { code: 'MISSING_URL', message: 'URL is required' } },
        { status: 400 }
      );
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_URL', message: 'Invalid YouTube URL format' } },
        { status: 400 }
      );
    }

    // Fetch video info using YouTube oEmbed API (no API key required)
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const oembedRes = await fetch(oembedUrl);

    if (!oembedRes.ok) {
      return NextResponse.json(
        { success: false, error: { code: 'VIDEO_NOT_FOUND', message: 'Video not found or is private' } },
        { status: 404 }
      );
    }

    const oembed = await oembedRes.json();

    // Get thumbnail (max resolution available)
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

    // Note: oEmbed doesn't provide duration. In production, you'd use
    // YouTube Data API or yt-dlp to get this. For now we'll return 0
    // and the worker will extract the actual duration during download.
    const videoInfo = {
      id: videoId,
      title: oembed.title || 'Unknown Title',
      duration: 0, // Will be resolved during download
      thumbnailUrl,
      channelName: oembed.author_name || 'Unknown Channel',
    };

    return NextResponse.json({
      success: true,
      data: videoInfo,
    });
  } catch (error) {
    console.error('YouTube validate error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to validate video' } },
      { status: 500 }
    );
  }
}
