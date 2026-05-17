import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { headObject } from '@/lib/s3';

// Force dynamic rendering — runtime DB + S3
export const dynamic = 'force-dynamic';

/**
 * POST /api/videos/:id/upload-complete
 *
 * Called by the client after a successful PUT to the presigned upload URL.
 * Verifies the object exists in S3 and flips the Video row from
 * "uploading" → "uploaded". Idempotent: safe to call repeatedly.
 *
 * The follow-up POST /api/videos/:id/process is what actually starts
 * the AI pipeline. We keep these two endpoints separate so the client
 * can mark "ready to process" without immediately consuming credits.
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
      select: { id: true, status: true, storageKey: true },
    });

    if (!video) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Video not found' } },
        { status: 404 }
      );
    }

    // Idempotent: if already past uploading, just confirm.
    if (video.status !== 'uploading') {
      return NextResponse.json({
        success: true,
        data: { videoId: video.id, status: video.status },
      });
    }

    // Verify the object actually exists in S3 before flipping status,
    // otherwise we'd later try to process a missing file.
    const head = await headObject(video.storageKey);
    if (!head) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UPLOAD_NOT_FOUND',
            message:
              'Upload not found in storage. Did the PUT to the presigned URL succeed?',
          },
        },
        { status: 409 }
      );
    }

    const updated = await prisma.video.update({
      where: { id: video.id },
      data: { status: 'uploaded' },
      select: { id: true, status: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        videoId: updated.id,
        status: updated.status,
        size: head.ContentLength ?? null,
      },
    });
  } catch (error) {
    console.error('upload-complete error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to mark upload complete' } },
      { status: 500 }
    );
  }
}
