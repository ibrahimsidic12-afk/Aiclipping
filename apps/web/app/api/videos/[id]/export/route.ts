import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { toPrismaJobType } from '@clip-ai/database';
import { enqueueJob } from '@/lib/queue';

// Force dynamic rendering — these routes need database access at runtime
export const dynamic = 'force-dynamic';

/**
 * POST /api/videos/:id/export
 *
 * Queue a render job for a clip with the specified settings.
 *
 * Creates a `render-clip` Job row, updates the related Clip's status to
 * "queued" if applicable, and enqueues a BullMQ job that the worker will
 * pick up. The DB job id is reused as the BullMQ job id so worker
 * lifecycle hooks update the same row.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const videoId = params.id;
    const body = await request.json();
    const { clipId, startTime, endTime, platform, captionStyle } = body as {
      clipId?: string;
      startTime: number;
      endTime: number;
      platform: string;
      captionStyle?: string;
    };

    // Validate
    if (startTime === undefined || endTime === undefined || !platform) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Missing required fields: startTime, endTime, platform',
          },
        },
        { status: 400 }
      );
    }

    if (endTime <= startTime) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'endTime must be greater than startTime' } },
        { status: 400 }
      );
    }

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, storageKey: true, status: true },
    });

    if (!video) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Video not found' } },
        { status: 404 }
      );
    }

    const presetKey = getPresetKey(platform);

    // If we have a clipId, look up its caption file (if any) so the render
    // job burns it in. Otherwise the user is exporting an ad-hoc range.
    let subtitleStorageKey: string | undefined;
    if (clipId) {
      // Captions are stored at captions/{clipId}/{style}.ass
      // We don't query S3 here — the worker will treat a missing file as a
      // soft-fail and still render without subtitles.
      const style = captionStyle || 'bold';
      subtitleStorageKey = `captions/${clipId}/${style}.ass`;
    }

    const job = await prisma.$transaction(async (tx) => {
      const created = await tx.job.create({
        data: {
          type: toPrismaJobType('render-clip'),
          status: 'waiting',
          videoId: video.id,
          clipId: clipId || null,
          payload: {
            videoId: video.id,
            clipId: clipId ?? null,
            videoStorageKey: video.storageKey,
            subtitleStorageKey: subtitleStorageKey ?? null,
            startTime,
            endTime,
            platform,
            captionStyle: captionStyle ?? null,
            preset: presetKey,
          },
        },
      });

      if (clipId) {
        await tx.clip.update({
          where: { id: clipId },
          data: { status: 'queued' },
        });
      }

      return created;
    });

    try {
      await enqueueJob(
        'render-clip',
        'render-clip',
        {
          clipId: clipId || job.id, // worker expects a stable id for the output path
          videoId: video.id,
          videoStorageKey: video.storageKey,
          subtitleStorageKey,
          preset: presetKey,
          platform,
          startTime,
          endTime,
        },
        { dbJobId: job.id, priority: 5 }
      );
    } catch (enqueueErr) {
      console.error('Failed to enqueue render job; marking failed:', enqueueErr);
      await prisma
        .$transaction([
          prisma.job.update({
            where: { id: job.id },
            data: { status: 'failed', error: 'Failed to enqueue render job' },
          }),
          ...(clipId
            ? [prisma.clip.update({ where: { id: clipId }, data: { status: 'error' } })]
            : []),
        ])
        .catch((rollbackErr) => {
          console.error('Rollback after enqueue failure also failed:', rollbackErr);
        });

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'QUEUE_UNAVAILABLE',
            message: 'Could not queue the export. Please try again.',
          },
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        jobId: job.id,
        status: 'queued',
        message: 'Export job queued successfully',
      },
    });
  } catch (error) {
    console.error('Export route error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to queue export' } },
      { status: 500 }
    );
  }
}

/**
 * Maps platform name to the correct video-core preset key.
 */
function getPresetKey(platform: string): string {
  const mapping: Record<string, string> = {
    tiktok: 'tiktok-1080',
    reels: 'reels-1080',
    shorts: 'shorts-1080',
    twitter: 'twitter-720',
    square: 'square-1080',
    landscape: 'landscape-1080',
  };
  return mapping[platform] || 'tiktok-1080';
}
