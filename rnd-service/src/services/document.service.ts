import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, getPresignedDownloadUrl } from './s3.service';

// Thin domain wrapper over the low-level S3 client for the "upload a document,
// list documents with download links, delete a document" pattern shared by
// student and teacher document vaults (and similar per-record S3 attachments).

export function buildDocumentKey(prefix: string, filename: string): string {
  const safeName = String(filename).replace(/\s+/g, '-');
  return `${prefix}/${Date.now()}-${safeName}`;
}

export async function uploadBase64Document(base64: string, s3Key: string): Promise<{ contentType: string }> {
  const base64Parts = base64.split(',');
  const base64Data = base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];
  const fileBuffer = Buffer.from(base64Data, 'base64');

  let contentType = 'application/octet-stream';
  const mimeMatch = base64.match(/^data:([^;]+);/);
  if (mimeMatch) contentType = mimeMatch[1];

  await getS3Client().send(new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: s3Key,
    Body: fileBuffer,
    ContentType: contentType,
  }));

  return { contentType };
}

export async function deleteDocumentFromS3(s3Key: string, logLabel: string): Promise<void> {
  try {
    await getS3Client().send(new DeleteObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: s3Key,
    }));
  } catch (err) {
    // Best-effort cleanup — caller proceeds with metadata removal even if this fails.
    console.error(`[${logLabel}] S3 delete failed for key:`, s3Key, err);
  }
}

export async function presignDocumentList<T extends { s3Key: string }>(
  docs: T[],
  logLabel: string
): Promise<Array<Omit<T, 's3Key'> & { downloadUrl: string }>> {
  return Promise.all(
    docs.map(async (doc) => {
      let downloadUrl = '';
      try {
        downloadUrl = await getPresignedDownloadUrl(doc.s3Key);
      } catch (err) {
        console.error(`[${logLabel}] Failed to presign:`, doc.s3Key, err);
      }
      const { s3Key, ...rest } = doc;
      return { ...rest, downloadUrl };
    })
  );
}
