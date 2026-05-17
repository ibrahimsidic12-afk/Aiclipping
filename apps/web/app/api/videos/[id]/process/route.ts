import { NextRequest, NextResponse } from 'next/server';
import { db } from '@clip-ai/database';

/**
 * POST /api/videos/:id/process
 * Trigger AI processing pipeline for uploaded video.
 * Updates video status and creates job records in the database.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const videoId = params.id;

    if (!videoId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Video ID required' } },
        { status: 400 }
      );
    }

    // Verify video exists
    const video = await db.video.findUnique({
      where: { id: videoId },
    });

    if (!video) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Video not found' } },
        { status: 404 }
      );
    }

    // Update video status to processing
    await db.video.update({
      where: { id: videoId },
      data: { status: 'PROCESSING' },
    });

    // Create job record in database for tracking
    const job = await db.job.create({
      data: {
        type: 'TRANSCRIBE',
        status: 'WAITING',
        videoId,
        payload: {
          videoId,
          audioStorageKey: video.storageKey,
          language: 'auto',
        },
        priority: 2,
      },
    });

    // TODO: Enqueue BullMQ job
    // const { Queue } = await import('bullmq');
    // const transcribeQueue = new Queue('transcribe', { connection: redis });
    // await transcribeQueue.add('transcribe', {
    //   videoId,
    //   audioStorageKey: video.storageKey,
    // });

    return NextResponse.json({
      success: true,
      data: {
        videoId,
        jobId: job.id,
        status: 'processing',
        message: 'Video processing pipeline started',
        jobs: [
          { type: 'transcribe', status: 'queued' },
          { type: 'detect-highlights', status: 'waiting' },
          { type: 'generate-captions', status: 'waiting' },
        ],
      },
    });
  } catch (error) {
    console.error('Process route error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to start processing' } },
      { status: 500 }
    );
  }
}
