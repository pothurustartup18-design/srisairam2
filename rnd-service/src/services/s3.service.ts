import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type WhatsAppMediaType = 'image' | 'video' | 'audio' | 'document';

// Presigned URL lifetimes (seconds)
export const PRESIGN_EXPIRY_7_DAYS = 604800; // maximum allowed by S3
export const PRESIGN_EXPIRY_2_HOURS = 7200;

// Meta's actual per-type media size caps for WhatsApp Cloud API messages —
// these are enforced by Meta regardless of where the file is hosted, and are
// independent of any S3/local storage decision.
export const WHATSAPP_MEDIA_SIZE_LIMITS: Record<WhatsAppMediaType, number> = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
};

// Module-level S3Client singleton — reused across all requests
let s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION || 'ap-southeast-2',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
  }
  return s3Client;
}

/**
 * Generates a presigned download URL for an object key in the configured bucket.
 */
export async function getPresignedDownloadUrl(
  s3Key: string,
  expiresIn: number = PRESIGN_EXPIRY_7_DAYS
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: s3Key,
  });
  return getSignedUrl(getS3Client(), command, { expiresIn });
}

/**
 * Extracts the object key from an S3 URL (raw or presigned).
 * Returns null when the URL does not point to S3.
 */
export function extractS3Key(rawUrl: string): string | null {
  if (!rawUrl.includes('amazonaws.com')) return null;
  try {
    const parsed = new URL(rawUrl);
    const key = decodeURIComponent(parsed.pathname.substring(1));
    return key || null;
  } catch {
    return null;
  }
}

/**
 * Returns the size in bytes of an S3 object, or null if it cannot be determined.
 */
export async function getS3ObjectSize(s3Key: string): Promise<number | null> {
  try {
    const response = await getS3Client().send(new HeadObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: s3Key,
    }));
    return response.ContentLength ?? null;
  } catch (err) {
    console.error('[S3] Failed to check object size for key:', s3Key, err);
    return null;
  }
}

/**
 * Infers the WhatsApp media type from a file URL based on its extension.
 */
export function getMediaType(url: string): WhatsAppMediaType {
  const lowercase = url.toLowerCase();
  if (
    lowercase.includes('.png') ||
    lowercase.includes('.jpg') ||
    lowercase.includes('.jpeg') ||
    lowercase.includes('.webp') ||
    lowercase.includes('.gif')
  ) {
    return 'image';
  }
  if (
    lowercase.includes('.mp3') ||
    lowercase.includes('.m4a') ||
    lowercase.includes('.ogg') ||
    lowercase.includes('.wav') ||
    lowercase.includes('.amr') ||
    lowercase.includes('.aac')
  ) {
    return 'audio';
  }
  if (
    lowercase.includes('.mp4') ||
    lowercase.includes('.m4v') ||
    lowercase.includes('.mov') ||
    lowercase.includes('.avi') ||
    lowercase.includes('.3gp')
  ) {
    return 'video';
  }
  return 'document';
}
