import { Router, Request, Response } from 'express';
import { Event, IEventAttachment } from '../../models/event.model';
import { getPresignedDownloadUrl, getMediaType, PRESIGN_EXPIRY_2_HOURS } from '../../services/s3.service';
import { renderGalleryPage, GalleryFile } from '../../services/mediaGallery.service';

const router = Router();

/**
 * PUBLIC — permanent gallery link for an Event Announcement's attachments.
 *
 * This is the destination of the WhatsApp `media_url` in the event_announcement_media
 * template, so it MUST be reachable with no ERP login / access token (a parent
 * clicks it from WhatsApp; Meta may fetch it for a link preview). It is mounted
 * on `/api/events` BEFORE the `authenticateJWT`-gated admin router in server.ts,
 * and it only handles this one path — every other `/api/events/*` route still
 * requires auth.
 *
 * Security model: the opaque 24-hex Mongo ObjectId is the access identifier
 * (unguessable). The response exposes ONLY the event title + its attachment files
 * (rendered from freshly-minted, short-lived presigned URLs) — no admin data, no
 * other event fields, no recipient/PII. S3 objects and the bucket stay private;
 * AWS credentials are never exposed. The permanent URL is stable until the admin
 * deletes the event or its attachments.
 */
router.get('/:eventId/media', async (req: Request, res: Response) => {
  const { eventId } = req.params;

  const notFound = () =>
    res
      .status(404)
      .set('Cache-Control', 'no-store')
      .type('html')
      .send(
        renderGalleryPage([], {
          title: 'Not found',
          heading: '📎 Attachments',
          emptyMessage: 'This event could not be found.'
        })
      );

  if (!/^[a-fA-F0-9]{24}$/.test(eventId)) return notFound();

  let event;
  try {
    event = await Event.findById(eventId).select('title mediaAttachments').lean();
  } catch {
    return notFound();
  }
  if (!event) return notFound();

  const attachments: IEventAttachment[] = Array.isArray(event.mediaAttachments) ? event.mediaAttachments : [];

  if (attachments.length === 0) {
    // Event exists but has zero attachments (never had any, or all deleted).
    // 200 + a friendly empty page — nothing is exposed, and a parent's browser
    // renders it cleanly.
    return res
      .status(200)
      .set('Cache-Control', 'no-store')
      .type('html')
      .send(
        renderGalleryPage([], {
          title: `Attachments — ${event.title}`,
          heading: `📎 ${event.title}`,
          emptyMessage: 'No attachments are currently available for this event.'
        })
      );
  }

  const files: GalleryFile[] = await Promise.all(
    attachments.map(async (a): Promise<GalleryFile> => ({
      url: await getPresignedDownloadUrl(a.s3Key, PRESIGN_EXPIRY_2_HOURS),
      type: a.mediaType || getMediaType(a.s3Key),
      filename: a.filename
    }))
  );

  return res
    .status(200)
    .set('Cache-Control', 'no-store')
    .type('html')
    .send(renderGalleryPage(files, { title: `Attachments — ${event.title}`, heading: `📎 ${event.title}` }));
});

export default router;
