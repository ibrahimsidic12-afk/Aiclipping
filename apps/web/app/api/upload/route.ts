import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { db } from '@clip-ai/database';

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '500', 10) * 1024 * 1024;

const ALLOWED_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/webm',
];

const PROVIDER = process.env.S3_PROVIDER || 'minio';
const isMinIO = PROVIDER === 'minio';

const s3 = new S3Client({
  region: process.env.S3_REGION || (isMinIO ? 'us-east-1' : 'auto'),
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: isMinIO,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
  },
});

const BUCKET = process.env.S3_BUCKET || 'clip-app-videos';

/**
 * POST /api/upload
 * Generate a presigned S3/R2 upload URL and create video record in database.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filename, contentType, size } = body as {
      filename: string;
      contentType: string;
      size: number;
    };

    // Validation
    if (!filename || !contentType || !size) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing required fields' } },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(contentType)) {
      return NextResponse.json(
        { success: false, error: { code: 'UNSUPPORTED_FORMAT', message: 'Unsupported video format' } },
        { status: 400 }
      );
    }

    if (size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: { code: 'FILE_TOO_LARGE', message: `File exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit` } },
        { status: 400 }
      );
    }

    // Create video record in database
    const video = await db.video.create({
      data: {
        originalName: filename,
        storageKey: '', // Will be updated after we generate it
        fileSize: size,
        format: contentType,
        status: 'UPLOADING',
        // TODO: Get real userId from auth session
        userId: 'anonymous',
      },
    });

    const extension = filename.split('.').pop() || 'mp4';
    const storageKey = `uploads/${video.id}/original.${extension}`;

    // Update the video with the storage key
    await db.video.update({
      where: { id: video.id },
      data: { storageKey },
    });

    // Generate real presigned upload URL (works with R2, S3, and MinIO)
    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: storageKey,
        ContentType: contentType,
      }),
      { expiresIn: 3600 } // 1 hour
    );

    return NextResponse.json({
      success: true,
      data: {
        videoId: video.id,
        uploadUrl,
        storageKey,
        expiresIn: 3600,
      },
    });
  } catch (error) {
    console.error('Upload route error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
}
