import sharp from 'sharp';
import { removeBackground } from '@imgly/background-removal-node';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, getPresignedDownloadUrl, PRESIGN_EXPIRY_7_DAYS } from './s3.service';

export interface SignatureProcessingResult {
  processedBuffer: Buffer;
  width: number;
  height: number;
}

/**
 * Validates and processes a signature image:
 * 1. Checks basic image validity & format
 * 2. Removes background (via @imgly/background-removal-node with a raw pixel fallback)
 * 3. Normalizes contrast, thresholds noise, and auto-trims whitespace
 * 4. Resizes to standard bounding box (Max 220px width, 80px height) using Lanczos3 kernel
 * 5. Compresses and outputs as high-quality transparent PNG
 */
export async function processSignatureImage(inputBuffer: Buffer): Promise<SignatureProcessingResult> {
  if (!inputBuffer || inputBuffer.length === 0) {
    throw new Error('Empty image file uploaded.');
  }

  if (inputBuffer.length > 5 * 1024 * 1024) {
    throw new Error('File size exceeds 5 MB limit.');
  }

  // Check image metadata
  let meta: any;
  try {
    meta = await sharp(inputBuffer).metadata();
  } catch {
    throw new Error('Invalid or corrupted image format.');
  }

  const allowedFormats = ['png', 'jpeg', 'jpg', 'webp'];
  if (!meta.format || !allowedFormats.includes(meta.format.toLowerCase())) {
    throw new Error(`Unsupported image format: ${meta.format || 'unknown'}. Allowed: PNG, JPG, JPEG, WEBP.`);
  }

  // ─── Step 1: Background Removal (Advanced) ───
  let transparentBuffer: Buffer = inputBuffer;
  let bgRemoved = false;

  try {
    const removedBgBlob = await removeBackground(inputBuffer);
    const arrayBuffer = await removedBgBlob.arrayBuffer();
    transparentBuffer = Buffer.from(arrayBuffer);
    bgRemoved = true;
  } catch (err) {
    console.warn('[SignatureService] Advanced background removal failed; falling back to threshold extraction:', err);
  }

  // ─── Step 2: Thresholding, Noise Removal, and Auto Trimming ───
  // Get raw RGBA pixel data to run thresholding & bounding box detection
  const { data, info } = await sharp(transparentBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const totalPixels = width * height;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let signaturePixelCount = 0;
  let transparentPixelCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      // Calculate brightness (luminance)
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

      // Detect background: transparent pixels, light pixels (brightness > 140),
      // or grayish paper pixels (brightness > 115 and close R/G/B values)
      const isGrayish = Math.abs(r - g) < 22 && Math.abs(g - b) < 22 && Math.abs(r - b) < 22;
      const isBg = a < 50 || brightness > 140 || (brightness > 110 && isGrayish);

      if (isBg) {
        data[idx + 3] = 0; // Transparent background
        transparentPixelCount++;
      } else {
        // Signature ink detected
        signaturePixelCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        // Enhance ink color: if blue tint is dominant, enrich blue. Otherwise, force rich black.
        const isBlue = b > r && b > g;
        if (isBlue) {
          data[idx] = Math.max(0, Math.round(r * 0.3));
          data[idx + 1] = Math.max(0, Math.round(g * 0.4));
          data[idx + 2] = Math.min(255, Math.round(b * 1.5));
        } else {
          data[idx] = Math.max(0, Math.round(r * 0.15));
          data[idx + 1] = Math.max(0, Math.round(g * 0.15));
          data[idx + 2] = Math.max(0, Math.round(b * 0.15));
        }
        data[idx + 3] = 255; // Solid opaque ink
      }
    }
  }

  // Validation: ensure signature actually exists
  if (signaturePixelCount === 0 || transparentPixelCount >= totalPixels * 0.999) {
    throw new Error('No signature ink detected. Please sign on white paper using black or blue ink.');
  }

  // Bounding box dimensions
  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;

  if (cropWidth < 10 || cropHeight < 10) {
    throw new Error('Signature detail is too small or faint to process cleanly.');
  }

  // ─── Step 3: Extract Trimmed Region ───
  const trimmedPng = await sharp(data, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .extract({ left: minX, top: minY, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();

  // ─── Step 4: High-Quality Resize & Compression ───
  // Resize maintaining aspect ratio (max 220px width, 80px height) using Lanczos3 kernel
  const finalProcessed = await sharp(trimmedPng)
    .resize(220, 80, {
      fit: 'inside',
      kernel: 'lanczos3', // Lanczos 3 interpolation for high resolution scaling
      withoutEnlargement: false,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer({ resolveWithObject: true });

  return {
    processedBuffer: finalProcessed.data,
    width: finalProcessed.info.width,
    height: finalProcessed.info.height,
  };
}

/**
 * Upload Teacher Signature to AWS S3 or fallback to Data URI
 */
export async function uploadTeacherSignatureToS3(teacherId: string, imageBuffer: Buffer): Promise<{ s3Key: string; url: string }> {
  const s3Key = `teachers/${teacherId}/signature.png`;
  const bucket = process.env.AWS_BUCKET_NAME;

  if (bucket && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    try {
      await getS3Client().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          Body: imageBuffer,
          ContentType: 'image/png',
          CacheControl: 'max-age=31536000',
        })
      );
      const presignedUrl = await getPresignedDownloadUrl(s3Key, PRESIGN_EXPIRY_7_DAYS);
      return { s3Key, url: presignedUrl };
    } catch (err) {
      console.warn('[SignatureService] S3 upload failed, falling back to Base64 Data URI:', err);
    }
  }

  // Fallback: base64 Data URI
  const dataUri = `data:image/png;base64,${imageBuffer.toString('base64')}`;
  return { s3Key, url: dataUri };
}

/**
 * Upload Principal Signature to AWS S3 or fallback to Data URI
 */
export async function uploadPrincipalSignatureToS3(imageBuffer: Buffer): Promise<{ s3Key: string; url: string }> {
  const s3Key = `school/principal/signature.png`;
  const bucket = process.env.AWS_BUCKET_NAME;

  if (bucket && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    try {
      await getS3Client().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          Body: imageBuffer,
          ContentType: 'image/png',
          CacheControl: 'max-age=31536000',
        })
      );
      const presignedUrl = await getPresignedDownloadUrl(s3Key, PRESIGN_EXPIRY_7_DAYS);
      return { s3Key, url: presignedUrl };
    } catch (err) {
      console.warn('[SignatureService] S3 principal upload failed, falling back to Base64 Data URI:', err);
    }
  }

  const dataUri = `data:image/png;base64,${imageBuffer.toString('base64')}`;
  return { s3Key, url: dataUri };
}

/**
 * Delete Teacher Signature from S3
 */
export async function deleteTeacherSignatureFromS3(teacherId: string): Promise<void> {
  const s3Key = `teachers/${teacherId}/signature.png`;
  const bucket = process.env.AWS_BUCKET_NAME;
  if (bucket) {
    try {
      await getS3Client().send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: s3Key,
        })
      );
    } catch (err) {
      console.warn(`[SignatureService] Could not delete S3 object for key ${s3Key}:`, err);
    }
  }
}

/**
 * Delete Principal Signature from S3
 */
export async function deletePrincipalSignatureFromS3(): Promise<void> {
  const s3Key = `school/principal/signature.png`;
  const bucket = process.env.AWS_BUCKET_NAME;
  if (bucket) {
    try {
      await getS3Client().send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: s3Key,
        })
      );
    } catch (err) {
      console.warn(`[SignatureService] Could not delete S3 object for key ${s3Key}:`, err);
    }
  }
}
