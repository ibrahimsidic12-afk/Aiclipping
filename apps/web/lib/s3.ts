import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  type DeleteObjectCommandInput,
  type HeadObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Shared S3 client for the web app. Reads config from env vars at module
 * load. Centralized here so we don't drift across upload/videos/export
 * routes.
 */
function buildClient(): S3Client {
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      '[s3] S3_ACCESS_KEY and S3_SECRET_KEY must be set. ' +
        'Refusing to fall back to default credentials.'
    );
  }

  return new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_PROVIDER !== 'r2',
    credentials: { accessKeyId, secretAccessKey },
  });
}

const globalForS3 = globalThis as unknown as {
  __s3: S3Client | undefined;
};

export function getS3Client(): S3Client {
  if (!globalForS3.__s3) {
    globalForS3.__s3 = buildClient();
  }
  return globalForS3.__s3;
}

export function getBucketName(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error('[s3] S3_BUCKET is not set');
  }
  return bucket;
}

/**
 * Generate a short-lived presigned URL for downloading/streaming an object.
 * Default 1h expiry; pass a custom value for longer-lived URLs.
 */
export async function getReadUrl(
  storageKey: string,
  expiresIn = 3600
): Promise<string> {
  const s3 = getS3Client();
  const cmd = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: storageKey,
  });
  return getSignedUrl(s3, cmd, { expiresIn });
}

/**
 * Generate a presigned URL for uploading an object (PUT).
 */
export async function getUploadUrl(
  storageKey: string,
  contentType: string,
  contentLength: number,
  expiresIn = 3600
): Promise<string> {
  const s3 = getS3Client();
  const cmd = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: storageKey,
    ContentType: contentType,
    ContentLength: contentLength,
  });
  return getSignedUrl(s3, cmd, { expiresIn });
}

/**
 * HEAD an S3 object. Returns metadata if it exists, null on 404.
 * Throws on other errors (network, permissions).
 */
export async function headObject(
  storageKey: string
): Promise<HeadObjectCommandOutput | null> {
  const s3 = getS3Client();
  try {
    return await s3.send(
      new HeadObjectCommand({ Bucket: getBucketName(), Key: storageKey })
    );
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'name' in err &&
      (err.name === 'NotFound' || err.name === 'NoSuchKey')
    ) {
      return null;
    }
    throw err;
  }
}

/**
 * Delete a single object. Used by cleanup paths.
 */
export async function deleteObject(storageKey: string): Promise<void> {
  const s3 = getS3Client();
  const input: DeleteObjectCommandInput = {
    Bucket: getBucketName(),
    Key: storageKey,
  };
  await s3.send(new DeleteObjectCommand(input));
}

/**
 * List objects under a prefix. Useful for prefix-based cleanup
 * (e.g., uploads/{videoId}/).
 */
export async function listObjects(prefix: string): Promise<string[]> {
  const s3 = getS3Client();
  const out = await s3.send(
    new ListObjectsV2Command({ Bucket: getBucketName(), Prefix: prefix })
  );
  return (out.Contents ?? []).map((o) => o.Key!).filter(Boolean);
}
