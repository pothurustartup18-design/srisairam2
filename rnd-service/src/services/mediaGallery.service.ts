import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, getPresignedDownloadUrl, WhatsAppMediaType } from './s3.service';

export interface GalleryFile {
  url: string;
  type: WhatsAppMediaType;
  filename?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderItem(file: GalleryFile): string {
  const safeUrl = escapeHtml(file.url);
  const safeName = escapeHtml(file.filename || 'attachment');

  let media = '';
  if (file.type === 'image') {
    media = `<img src="${safeUrl}" alt="${safeName}" loading="lazy" />`;
  } else if (file.type === 'video') {
    media = `<video src="${safeUrl}" controls playsinline></video>`;
  } else if (file.type === 'audio') {
    media = `<audio src="${safeUrl}" controls></audio>`;
  } else {
    media = `<div style="padding: 24px; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 500; color: #64748b;">📄 Document File</div>`;
  }

  const downloadBtn = `<a class="download-btn" href="${safeUrl}" download="${safeName}" target="_blank" rel="noopener noreferrer">⬇ Download File</a>`;

  return `<div class="item">${media}<div class="item-footer"><div class="filename">${safeName}</div>${downloadBtn}</div></div>`;
}

export interface GalleryPageOptions {
  /** <title> text. */
  title?: string;
  /** Heading text; defaults to "📎 Shared Files (N)". */
  heading?: string;
  /** Shown when there are zero files (instead of a broken/empty page). */
  emptyMessage?: string;
}

/**
 * Renders a self-contained gallery HTML page (no external assets, no scripts).
 * Pure function — same input → same output — so it is safe to call on every
 * request. Empty `files` renders a friendly empty state.
 */
export function renderGalleryPage(files: GalleryFile[], opts: GalleryPageOptions = {}): string {
  const title = escapeHtml(opts.title || 'Shared Files');
  const heading = escapeHtml(opts.heading || `📎 Shared Files (${files.length})`);
  const inner =
    files.length === 0
      ? `<div class="empty">${escapeHtml(opts.emptyMessage || 'No files are currently available.')}</div>`
      : files.map(renderItem).join('\n');
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; background:#f1f5f9; margin:0; padding:16px; color:#0f172a; }
  h1 { font-size:18px; margin:0 0 16px; }
  .item { background:#ffffff; border-radius:10px; padding:12px; margin-bottom:12px; box-shadow:0 1px 2px rgba(0,0,0,0.08); }
  .item img, .item video { width:100%; border-radius:8px; display:block; max-height:70vh; object-fit:contain; background:#000; }
  .item audio { width:100%; }
  .item-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; flex-wrap: wrap; gap: 8px; }
  .filename { font-size:13px; color:#475569; word-break:break-all; font-weight:500; max-width:70%; }
  .download-btn { display:inline-flex; align-items:center; gap:4px; color:#ffffff; background:#4f46e5; text-decoration:none; font-weight:600; font-size:13px; padding:6px 12px; border-radius:6px; transition: background 0.2s; cursor: pointer; }
  .download-btn:hover { background:#3730a3; }
  .doc-link { display:inline-flex; align-items:center; gap:8px; color:#4f46e5; text-decoration:none; font-weight:600; font-size:15px; }
  .empty { background:#ffffff; border-radius:10px; padding:32px 16px; text-align:center; color:#64748b; font-size:14px; font-weight:500; box-shadow:0 1px 2px rgba(0,0,0,0.08); }
</style>
</head>
<body>
<h1>${heading}</h1>
${inner}
</body>
</html>`;
}

function buildGalleryHtml(files: GalleryFile[]): string {
  return renderGalleryPage(files);
}

/**
 * Bundles multiple (or one oversized) attachments into a single self-contained
 * HTML page uploaded to S3, and returns a presigned URL to it. Used whenever
 * WhatsApp can't carry the attachments natively — either because there's more
 * than one, or because a single file exceeds Meta's per-type size cap.
 */
export async function uploadGallery(files: GalleryFile[]): Promise<string> {
  const html = buildGalleryHtml(files);
  const buffer = Buffer.from(html, 'utf-8');
  const year = new Date().getFullYear();
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  const s3Key = `galleries/${year}/${uniqueSuffix}.html`;

  await getS3Client().send(new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: s3Key,
    Body: buffer,
    ContentType: 'text/html; charset=utf-8',
  }));

  return getPresignedDownloadUrl(s3Key);
}
