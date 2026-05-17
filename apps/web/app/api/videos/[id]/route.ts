import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { deleteObject, getReadUrl, listObjects } from '@/lib/s3';

// Force dynamic rendering — these routes need database access at runtime
export const dynamic = 'force-dynamic';

/**
 * GET /api/videos/:id
 * Returns a single video with its clips, transcript, and recent jobs.
 *
 * Generates a short-lived (1h) presigned playback URL on the fly. We do
 * not persist this URL anywhere — clients reload the page or refetch
 * the route to get a fresh one.
 */
export async function GET(
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
      include: {
        clips: {
          orderBy: { viralityScore: 'desc' },
          select: {
            id: true,
            startTime: true,
            endTime: true,
            duration: true,
            hookText: true,
            viralityScore: true,
            tags: true,
            status: true,
            exports: {
              select: {
                id: true,
                platform: true,
                url: true,
                resolution: true,
                exportedAt: true,
              },
            },
          },
        },
        transcript: {
          select: {
            id: true,
            language: true,
            duration: true,
            wordCount: true,
            segmentCount: true,
          },
        },
        jobs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            type: true,
            status: true,
            progress: true,
            createdAt: true,
            completedAt: true,
          },
        },
      },
    });

    if (!video) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Video not found' } },
        { status: 404 }
      );
    }

    // Generate a fresh playback URL. If S3 is misconfigured we don't want to
    // bring down the whole detail endpoint — log and serve null.
    let playbackUrl: string | null = video.url ?? null;
    if (video.storageKey) {
      try {
        playbackUrl = await getReadUrl(video.storageKey, 3600);
      } catch (err) {
        console.warn('Failed to sign playback URL:', (err as Error).message);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        video: {
          id: video.id,
          originalName: video.originalName,
          status: video.status,
          url: playbackUrl,
          thumbnailUrl: video.thumbnailUrl,
          metadata: video.metadata,
          tags: video.tags,
          error: video.error,
          createdAt: video.createdAt,
          updatedAt: video.updatedAt,
        },
        clips: video.clips,
        transcript: video.transcript,
        jobs: video.jobs,
      },
    });
  } catch (error) {
    console.error('Video detail error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch video' } },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/videos/:id
 * Update video metadata (tags, name).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const videoId = params.id;
    const body = await request.json();
    const { tags, originalName } = body as { tags?: string[]; originalName?: string };

    const updateData: Record<string, unknown> = {};
    if (tags !== undefined) updateData.tags = tags;
    if (originalName !== undefined) updateData.originalName = originalName;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } },
        { status: 400 }
      );
    }

    const video = await prisma.video.update({
      where: { id: videoId },
      data: updateData,
      select: { id: true, originalName: true, tags: true, updatedAt: true },
    });

    return NextResponse.json({ success: true, data: video });
  } catch (error) {
    console.error('Video update error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update video' } },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/videos/:id
 *
 * Cascade-deletes the video row (cascades into clips/transcript/exports
 * via Prisma relations). Then best-effort cleans up the S3 prefixes:
 * uploads/{videoId}/, transcripts/{videoId}/, captions/{clipId}/,
 * clips/{clipId}/.
 *
 * S3 cleanup is intentionally best-effort: we never block the response
 * on a slow S3 list. If a prefix has stragglers, a periodic worker
 * cleanup job can reclaim them later.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const videoId = params.id;

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: {
        id: true,
        storageKey: true,
        clips: { select: { id: true } },
        transcript: { select: { storageKey: true } },
      },
    });

    if (!video) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Video not found' } },
        { status: 404 }
      );
    }

    const clipIds = video.clips.map((c) => c.id);

    // Cascade delete handles clips, transcript, exports, jobs
    await prisma.video.delete({ where: { id: videoId } });

    // Best-effort S3 cleanup. Wrapped so it never throws into the response.
    try {
      await Promise.allSettled([
        deleteObject(video.storageKey),
        ...(video.transcript?.storageKey
          ? [deleteObject(video.transcript.storageKey)]
          : []),
        deletePrefix(`uploads/${videoId}/`),
        deletePrefix(`transcripts/${videoId}/`),
        ...clipIds.flatMap((clipId) => [
          deletePrefix(`captions/${clipId}/`),
          deletePrefix(`clips/${clipId}/`),
        ]),
      ]);
    } catch (s3Error) {
      console.warn('S3 cleanup failed (will be orphaned):', (s3Error as Error).message);
    }

    return NextResponse.json({ success: true, data: { deleted: videoId } });
  } catch (error) {
    console.error('Video delete error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete video' } },
      { status: 500 }
    );
  }
}

/**
 * Lists everything under a prefix and deletes objects one by one.
 * Returns silently on errors — this is purely a best-effort cleanup.
 */
async function deletePrefix(prefix: string): Promise<void> {
  try {
    const keys = await listObjects(prefix);
    if (keys.length === 0) return;
    await Promise.allSettled(keys.map((key) => deleteObject(key)));
  } catch (err) {
    console.warn(`Failed to clean up prefix ${prefix}:`, (err as Error).message);
  }
}
