import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { toPrismaJobType } from '@clip-ai/database';
import { enqueueJob } from '@/lib/queue';

// Force dynamic rendering — these routes need database access at runtime
export const dynamic = 'force-dynamic';

/**
 * POST /api/videos/:id/process
 *
 * Trigger the AI processing pipeline for an uploaded video.
 *
 * Steps performed atomically inside a Prisma transaction:
 *  1. Verify the video exists and is in "uploaded" status
 *  2. Atomically decrement user credits (race-safe via WHERE clause)
 *  3. Create a `transcribe` Job row (id used as BullMQ job id)
 *  4. Flip Video status to "processing"
 *
 * After the transaction commits, push the job onto the BullMQ
 * `transcribe` queue so the worker actually picks it up. If enqueue
 * fails, we roll the row state back so the user can retry.
 */
export async function POST(
  _request: NextRequest,
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

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, userId: true, status: true, storageKey: true },
    });

    if (!video) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Video not found' } },
        { status: 404 }
      );
    }

    // TODO: ownership check — once auth lands, ensure video.userId === session.userId
    // and return NOT_FOUND instead of leaking that the row exists.

    if (video.status !== 'uploaded') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Video must be in "uploaded" status to process. Current status: "${video.status}"`,
          },
        },
        { status: 400 }
      );
    }

    // Atomic transaction: race-safe credit check, job creation, status flip.
    // Credit decrement is gated on `credits > 0` in the WHERE clause; if
    // two requests race, only one will match a row and decrement.
    const result = await prisma.$transaction(async (tx) => {
      const debited = await tx.user.updateMany({
        where: { id: video.userId, credits: { gt: 0 } },
        data: { credits: { decrement: 1 } },
      });

      if (debited.count === 0) {
        return { kind: 'no-credits' as const };
      }

      const newJob = await tx.job.create({
        data: {
          type: toPrismaJobType('transcribe'),
          status: 'waiting',
          videoId: video.id,
          payload: { audioStorageKey: video.storageKey, videoId: video.id },
        },
      });

      await tx.video.update({
        where: { id: video.id },
        data: { status: 'processing' },
      });

      return { kind: 'ok' as const, job: newJob };
    });

    if (result.kind === 'no-credits') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INSUFFICIENT_CREDITS',
            message: 'No processing credits remaining. Upgrade your plan to continue.',
          },
        },
        { status: 402 }
      );
    }

    // Push to BullMQ so the worker actually picks it up. Use the DB job id
    // as the BullMQ job id so worker lifecycle hooks update the same row.
    try {
      await enqueueJob(
        'transcribe',
        'transcribe',
        {
          videoId: video.id,
          audioStorageKey: video.storageKey,
        },
        { dbJobId: result.job.id, priority: 1 }
      );
    } catch (enqueueErr) {
      console.error('Failed to enqueue transcribe job; rolling back:', enqueueErr);
      // Best-effort rollback: refund credit, mark job failed, restore video status.
      await prisma
        .$transaction([
          prisma.user.update({
            where: { id: video.userId },
            data: { credits: { increment: 1 } },
          }),
          prisma.job.update({
            where: { id: result.job.id },
            data: {
              status: 'failed',
              error: 'Failed to enqueue job onto BullMQ',
            },
          }),
          prisma.video.update({
            where: { id: video.id },
            data: { status: 'uploaded' },
          }),
        ])
        .catch((rollbackErr) => {
          console.error('Rollback after enqueue failure also failed:', rollbackErr);
        });

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'QUEUE_UNAVAILABLE',
            message:
              'Could not queue the job. The processing service may be down. Please try again.',
          },
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        videoId,
        status: 'processing',
        message: 'Video processing pipeline started',
        job: {
          id: result.job.id,
          type: 'transcribe',
          status: result.job.status,
        },
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
