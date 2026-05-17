import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db';
import { toPrismaJobType } from '@clip-ai/database';
import { enqueueJob } from '@/lib/queue';
import { canonicalYoutubeUrl, parseYoutubeVideoId } from '@/lib/youtube';

// Force dynamic rendering — runtime DB and queue access
export const dynamic = 'force-dynamic';

/**
 * POST /api/videos/from-url
 *
 * Create a Video row from a YouTube URL and kick off the fetch-source
 * pipeline. The worker downloads the video to S3, then chains into the
 * existing transcribe → highlights → captions → render flow.
 *
 * Mirrors the credit/atomic-transaction pattern used by /process so
 * users can't double-spend by spamming the endpoint.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const url = (body && typeof body === 'object' && typeof body.url === 'string') ? body.url : '';

    if (!url) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'URL is required' } },
        { status: 400 }
      );
    }

    const youtubeId = parseYoutubeVideoId(url);
    if (!youtubeId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNSUPPORTED_URL',
            message: 'Only single YouTube videos are supported (no playlists, no channels).',
          },
        },
        { status: 400 }
      );
    }

    const sourceUrl = canonicalYoutubeUrl(youtubeId);

    // TODO: replace with real authenticated user ID from auth middleware
    const userId =
      request.headers.get('x-user-id') || '00000000-0000-0000-0000-000000000000';

    // Ensure the dev user exists (foreign key requires a valid User row)
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: 'dev@localhost', name: 'Dev User' },
    });

    const videoId = randomUUID();
    const placeholderKey = `uploads/${videoId}/original.mp4`;

    // Atomic transaction: race-safe credit debit, video row creation, job row creation.
    const result = await prisma.$transaction(async (tx) => {
      const debited = await tx.user.updateMany({
        where: { id: userId, credits: { gt: 0 } },
        data: { credits: { decrement: 1 } },
      });

      if (debited.count === 0) {
        return { kind: 'no-credits' as const };
      }

      const video = await tx.video.create({
        data: {
          id: videoId,
          userId,
          originalName: sourceUrl, // worker overwrites with the real title
          storageKey: placeholderKey,
          status: 'fetching',
          sourceType: 'youtube',
          sourceUrl,
          tags: [],
        },
      });

      const job = await tx.job.create({
        data: {
          type: toPrismaJobType('fetch-source'),
          status: 'waiting',
          videoId: video.id,
          payload: { videoId: video.id, sourceUrl },
        },
      });

      return { kind: 'ok' as const, video, job };
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

    try {
      await enqueueJob(
        'fetch-source',
        'fetch-source',
        {
          videoId: result.video.id,
          sourceUrl,
        },
        { dbJobId: result.job.id, priority: 1 }
      );
    } catch (enqueueErr) {
      console.error('Failed to enqueue fetch-source job; rolling back:', enqueueErr);
      await prisma
        .$transaction([
          prisma.user.update({
            where: { id: userId },
            data: { credits: { increment: 1 } },
          }),
          prisma.job.update({
            where: { id: result.job.id },
            data: { status: 'failed', error: 'Failed to enqueue fetch-source job' },
          }),
          prisma.video.update({
            where: { id: result.video.id },
            data: { status: 'error', error: 'Failed to enqueue fetch-source job' },
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
            message: 'Could not queue the fetch. Please try again.',
          },
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        videoId: result.video.id,
        status: 'fetching',
        sourceUrl,
        message: 'YouTube fetch started',
      },
    });
  } catch (error) {
    console.error('from-url route error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to start fetch' } },
      { status: 500 }
    );
  }
}
