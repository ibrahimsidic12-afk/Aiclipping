import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/youtube/status/[id]
 * Check the status of a YouTube import job.
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

    // TODO: In production, look up job status from Redis/BullMQ
    // const job = await downloadQueue.getJob(id);
    // return real progress from the worker

    // Mock progress response for development
    // In production, this would check BullMQ job progress
    return NextResponse.json({
      success: true,
      data: {
        importId: id,
        status: 'processing',
        progress: 45,
        message: 'Analyzing video for viral moments...',
        videoId: null,
        clipIds: [],
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
