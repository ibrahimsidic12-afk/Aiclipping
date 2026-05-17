import { NextRequest, NextResponse } from 'next/server';
import { db } from '@clip-ai/database';

/**
 * GET /api/youtube/status/[id]
 * Check the status of a YouTube import job from database.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: { code: 'MISSING_ID', message: 'Import ID is required' } },
        { status: 400 }
      );
    }

    // Look up import status from database
    const youtubeImport = await db.youTubeImport.findUnique({
      where: { id },
    });

    if (!youtubeImport) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Import not found' } },
        { status: 404 }
      );
    }

    // Map status to user-friendly message
    const statusMessages: Record<string, string> = {
      PENDING: 'Waiting to start...',
      DOWNLOADING: 'Downloading video from YouTube...',
      DOWNLOADED: 'Video downloaded, starting analysis...',
      PROCESSING: 'Transcribing and analyzing video...',
      CLIPPING: 'Generating viral clips with AI...',
      COMPLETED: 'All clips generated successfully!',
      ERROR: youtubeImport.error || 'Something went wrong',
    };

    return NextResponse.json({
      success: true,
      data: {
        importId: youtubeImport.id,
        status: youtubeImport.status.toLowerCase(),
        progress: youtubeImport.progress,
        message: statusMessages[youtubeImport.status] || 'Processing...',
        videoId: youtubeImport.videoId,
        clipIds: youtubeImport.clipIds,
        error: youtubeImport.error,
      },
    });
  } catch (error) {
    console.error('YouTube status error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to check status' } },
      { status: 500 }
    );
  }
}
