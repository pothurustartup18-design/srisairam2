import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { removeBackground } from '@imgly/background-removal-node';
import { getS3Client, getPresignedDownloadUrl } from './s3.service';
import { Student } from '../models/student.model';
import { Teacher } from '../models/teacher.model';
import { SchoolProfile } from '../models/schoolProfile.model';

// helper to transform readable stream to buffer
async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// Image optimization logic
export async function optimizeImage(buffer: Buffer, type: 'logo' | 'signature' | 'photo'): Promise<{ buffer: Buffer, contentType: string }> {
  try {
    let s = sharp(buffer);
    if (type === 'logo') {
      const optimized = await s
        .resize({ width: 200, height: 200, fit: 'inside', withoutEnlargement: true })
        .png({ compressionLevel: 9, quality: 80 })
        .toBuffer();
      return { buffer: optimized, contentType: 'image/png' };
    } else if (type === 'signature') {
      const optimized = await s
        .resize({ width: 300, height: 150, fit: 'inside', withoutEnlargement: true })
        .png({ compressionLevel: 9, quality: 80 })
        .toBuffer();
      return { buffer: optimized, contentType: 'image/png' };
    } else { // photo
      const optimized = await s
        .resize({ width: 300, height: 300, fit: 'cover', withoutEnlargement: true })
        .jpeg({ quality: 80, mozjpeg: true })
        .toBuffer();
      return { buffer: optimized, contentType: 'image/jpeg' };
    }
  } catch (err) {
    console.error(`[AssetOptimization] Sharp optimization failed for ${type}:`, err);
    return { buffer, contentType: 'image/png' };
  }
}

export interface OptimizedAssetMeta {
  s3Key: string;
  width: number;
  height: number;
  size: number;
  format: string;
  optimizedAt: Date;
}

/**
 * Generates and uploads optimized variants of student photo beside the original.
 */
export async function processAndUploadStudentPhoto(
  originalBuffer: Buffer,
  originalS3Key: string
): Promise<Record<string, OptimizedAssetMeta>> {
  const baseKey = originalS3Key.substring(0, originalS3Key.lastIndexOf('.'));
  
  // Versions metadata
  const versions: Record<string, { width: number; height: number; quality: number; format: 'webp' | 'jpeg'; suffix: string; fit: 'cover' | 'inside' }> = {
    thumbnail: { width: 100, height: 100, quality: 75, format: 'webp', suffix: '-thumbnail.webp', fit: 'cover' },
    profile: { width: 250, height: 250, quality: 80, format: 'webp', suffix: '-profile.webp', fit: 'cover' },
    'report-card': { width: 400, height: 400, quality: 85, format: 'jpeg', suffix: '-report-card.jpg', fit: 'cover' },
    'id-card': { width: 500, height: 500, quality: 85, format: 'jpeg', suffix: '-id-card.jpg', fit: 'cover' }
  };

  const results: Record<string, OptimizedAssetMeta> = {};

  for (const [name, cfg] of Object.entries(versions)) {
    const targetKey = `${baseKey}${cfg.suffix}`;
    const s = sharp(originalBuffer).rotate().resize({ width: cfg.width, height: cfg.height, fit: cfg.fit });
    
    let processedBuffer: Buffer;
    if (cfg.format === 'webp') {
      processedBuffer = await s.webp({ quality: cfg.quality }).toBuffer();
    } else {
      processedBuffer = await s.jpeg({ quality: cfg.quality, mozjpeg: true }).toBuffer();
    }

    const meta = await sharp(processedBuffer).metadata();
    
    // Upload to S3
    await getS3Client().send(new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: targetKey,
      Body: processedBuffer,
      ContentType: `image/${cfg.format}`,
      CacheControl: 'max-age=31536000'
    }));

    results[name] = {
      s3Key: targetKey,
      width: meta.width || cfg.width,
      height: meta.height || cfg.height,
      size: processedBuffer.length,
      format: cfg.format,
      optimizedAt: new Date()
    };
  }

  return results;
}

/**
 * Processes and uploads teacher/principal signatures (reusing binarization pipeline).
 */
export async function processAndUploadSignature(
  originalBuffer: Buffer,
  originalS3Key: string
): Promise<OptimizedAssetMeta> {
  const baseKey = originalS3Key.substring(0, originalS3Key.lastIndexOf('.'));
  const targetKey = `${baseKey}-signature.png`;

  // Background removal fallback
  let transparentBuffer = originalBuffer;
  try {
    const config: any = {
      model_path: process.env.IMG_MODEL_PATH || undefined,
      output: { format: 'image/png' }
    };
    const blob = await removeBackground(originalBuffer, config);
    const arrayBuffer = await (blob as any).arrayBuffer();
    transparentBuffer = Buffer.from(arrayBuffer);
  } catch (err) {
    console.warn('[AssetOptimization] Advanced background removal failed, using threshold logic:', err);
  }

  const { data, info } = await sharp(transparentBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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

      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
      const isGrayish = Math.abs(r - g) < 22 && Math.abs(g - b) < 22 && Math.abs(r - b) < 22;
      const isBg = a < 50 || brightness > 140 || (brightness > 110 && isGrayish);

      if (isBg) {
        data[idx + 3] = 0;
        transparentPixelCount++;
      } else {
        signaturePixelCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

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
        data[idx + 3] = 255;
      }
    }
  }

  // Fallback to raw buffer if signature is not detected
  let trimmedPng = transparentBuffer;
  if (signaturePixelCount > 0 && transparentPixelCount < totalPixels * 0.999) {
    const cropWidth = maxX - minX + 1;
    const cropHeight = maxY - minY + 1;
    if (cropWidth >= 10 && cropHeight >= 10) {
      trimmedPng = await sharp(data, { raw: { width, height, channels: 4 } })
        .extract({ left: minX, top: minY, width: cropWidth, height: cropHeight })
        .png()
        .toBuffer();
    }
  }

  const finalProcessed = await sharp(trimmedPng)
    .resize(300, 150, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  const meta = await sharp(finalProcessed).metadata();

  await getS3Client().send(new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: targetKey,
    Body: finalProcessed,
    ContentType: 'image/png',
    CacheControl: 'max-age=31536000'
  }));

  return {
    s3Key: targetKey,
    width: meta.width || 300,
    height: meta.height || 150,
    size: finalProcessed.length,
    format: 'png',
    optimizedAt: new Date()
  };
}

/**
 * Processes and uploads school logo sizes beside original.
 */
export async function processAndUploadSchoolLogo(
  originalBuffer: Buffer,
  originalS3Key: string
): Promise<Record<string, OptimizedAssetMeta>> {
  const baseKey = originalS3Key.substring(0, originalS3Key.lastIndexOf('.'));
  
  const versions = {
    small: { width: 100, suffix: '-small.png' },
    medium: { width: 250, suffix: '-medium.png' },
    large: { width: 500, suffix: '-large.png' }
  };

  const results: Record<string, OptimizedAssetMeta> = {};

  for (const [name, cfg] of Object.entries(versions)) {
    const targetKey = `${baseKey}${cfg.suffix}`;
    const processedBuffer = await sharp(originalBuffer)
      .resize({ width: cfg.width, height: cfg.width, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9, quality: 80 })
      .toBuffer();

    const meta = await sharp(processedBuffer).metadata();

    await getS3Client().send(new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: targetKey,
      Body: processedBuffer,
      ContentType: 'image/png',
      CacheControl: 'max-age=31536000'
    }));

    results[name] = {
      s3Key: targetKey,
      width: meta.width || cfg.width,
      height: meta.height || cfg.width,
      size: processedBuffer.length,
      format: 'png',
      optimizedAt: new Date()
    };
  }

  return results;
}

/**
 * Synchronous in-process worker driver (also BullMQ fallback handler).
 */
export async function optimizeAssetSync(data: {
  assetType: 'photo' | 'signature' | 'logo';
  s3Key: string;
  modelType: 'student' | 'teacher' | 'schoolProfile';
  modelId: string;
  docId?: string;
}): Promise<void> {
  const { assetType, s3Key, modelType, modelId, docId } = data;
  console.log(`[AssetOptimization] Running processing for key: ${s3Key} (Asset Type: ${assetType})`);

  let fileBuffer: Buffer;
  
  try {
    const response = await getS3Client().send(new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: s3Key
    }));
    fileBuffer = await streamToBuffer(response.Body);
  } catch (err) {
    console.error(`[AssetOptimization] Failed to download original asset from S3 for key ${s3Key}:`, err);
    return;
  }

  if (assetType === 'photo') {
    const versions = await processAndUploadStudentPhoto(fileBuffer, s3Key);
    if (modelType === 'student') {
      await Student.updateOne(
        { _id: modelId, 'documents._id': docId },
        { $set: { 'documents.$.optimizedVersions': versions } }
      );
    }
  } else if (assetType === 'signature') {
    const optimized = await processAndUploadSignature(fileBuffer, s3Key);
    if (modelType === 'teacher') {
      await Teacher.updateOne(
        { _id: modelId },
        { $set: { signatureOptimizedVersions: optimized } }
      );
    } else if (modelType === 'schoolProfile') {
      await SchoolProfile.updateOne(
        { _id: modelId },
        { $set: { 'principalInfo.signatureOptimizedVersions': optimized } }
      );
    }
  } else if (assetType === 'logo') {
    const versions = await processAndUploadSchoolLogo(fileBuffer, s3Key);
    if (modelType === 'schoolProfile') {
      await SchoolProfile.updateOne(
        { _id: modelId },
        { $set: { 'schoolInfo.logoOptimizedVersions': versions } }
      );
    }
  }
  
  console.log(`[AssetOptimization] Successfully completed processing for key: ${s3Key}`);
}

/**
 * Self-healing loader helper for backward compatibility.
 * Checks if optimized versions exist; if not, triggers the optimization synchronously and returns it.
 */
export async function getOrCreateOptimizedVersion(
  modelType: 'student' | 'teacher' | 'schoolProfile',
  modelId: string,
  docId: string | undefined,
  originalS3Key: string,
  assetType: 'photo' | 'signature' | 'logo'
): Promise<string> {
  try {
    if (modelType === 'student' && docId) {
      const student = await Student.findById(modelId).lean();
      const doc = student?.documents?.find((d: any) => d._id.toString() === docId) as any;
      if (doc?.optimizedVersions) {
        const optMap = doc.optimizedVersions as any;
        if (optMap.get && optMap.get('report-card')) return optMap.get('report-card').s3Key;
        if (optMap['report-card']) return optMap['report-card'].s3Key;
      }
    } else if (modelType === 'teacher') {
      const teacher = await Teacher.findById(modelId).lean();
      if ((teacher as any)?.signatureOptimizedVersions?.s3Key) {
        return (teacher as any).signatureOptimizedVersions.s3Key;
      }
    } else if (modelType === 'schoolProfile') {
      const profile = await SchoolProfile.findOne().lean();
      if (assetType === 'logo' && profile?.schoolInfo?.logoOptimizedVersions) {
        const logoMap = profile.schoolInfo.logoOptimizedVersions as any;
        if (logoMap.get && logoMap.get('small')) return logoMap.get('small').s3Key;
        if (logoMap.small) return logoMap.small.s3Key;
      } else if (assetType === 'signature' && profile?.principalInfo?.signatureOptimizedVersions) {
        const sig = profile.principalInfo.signatureOptimizedVersions as any;
        if (sig.s3Key) return sig.s3Key;
      }
    }

    // Legacy file, trigger optimization sync right now (self-healing)
    console.log(`[AssetOptimization] Self-healing legacy trigger for ${assetType} key: ${originalS3Key}`);
    await optimizeAssetSync({
      assetType,
      s3Key: originalS3Key,
      modelType,
      modelId,
      docId
    });

    // Re-query target S3 key
    if (modelType === 'student' && docId) {
      const student = await Student.findById(modelId).lean();
      const doc = student?.documents?.find((d: any) => d._id.toString() === docId) as any;
      if (doc?.optimizedVersions) {
        const optMap = doc.optimizedVersions as any;
        if (optMap.get && optMap.get('report-card')) return optMap.get('report-card').s3Key;
        if (optMap['report-card']) return optMap['report-card'].s3Key;
      }
    } else if (modelType === 'teacher') {
      const teacher = await Teacher.findById(modelId).lean();
      if ((teacher as any)?.signatureOptimizedVersions?.s3Key) {
        return (teacher as any).signatureOptimizedVersions.s3Key;
      }
    } else if (modelType === 'schoolProfile') {
      const profile = await SchoolProfile.findOne().lean();
      if (assetType === 'logo' && profile?.schoolInfo?.logoOptimizedVersions) {
        const logoMap = profile.schoolInfo.logoOptimizedVersions as any;
        if (logoMap.get && logoMap.get('small')) return logoMap.get('small').s3Key;
        if (logoMap.small) return logoMap.small.s3Key;
      } else if (assetType === 'signature' && profile?.principalInfo?.signatureOptimizedVersions) {
        const sig = profile.principalInfo.signatureOptimizedVersions as any;
        if (sig.s3Key) return sig.s3Key;
      }
    }
  } catch (err) {
    console.error(`[AssetOptimization] Self-healing process failed for key ${originalS3Key}:`, err);
  }

  return originalS3Key; // ultimate fallback
}
