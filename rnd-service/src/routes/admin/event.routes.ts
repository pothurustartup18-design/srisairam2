import { Router, Request, Response } from 'express';
import { Event } from '../../models/event.model';
import { ScheduledAlert } from '../../models/scheduledAlert.model';
import { SystemConfig } from '../../models/systemConfig.model';
import { executeAlertBroadcast, BroadcastFilters, BroadcastTemplate, formatTemplateDate } from '../../services/scheduler';

/**
 * Approved-template descriptor for an event/notice alert.
 *  - a "notice" (type !== 'event')                → announcement_broadcast, param: custom
 *  - an "event" with no attachments                → event_announcement, params: event_title / _date / _description
 *  - an "event" WITH attachments                    → event_announcement_media, same three params
 *    plus media_url (the permanent gallery link, a clean single-line URL).
 *    event_description is always the admin's raw text, verbatim — never
 *    concatenate the link into it. That was tried once and Meta rejected
 *    every send with HTTP 400 / code 132018 ("issue with the parameters"):
 *    the approved template's BODY params reject embedded newlines, and the
 *    link was being appended as `${description}\n\n...${link}`. There is no
 *    equivalent media template for notices — see MISSING_TEMPLATES.
 */
function buildAlertTemplate(opts: {
  type?: string;
  title: string;
  description?: string;
  date?: string | Date;
  mediaUrl?: string | null;
}): BroadcastTemplate {
  const desc = (opts.description || '').trim();
  if (opts.type === 'event') {
    const eventDate = opts.date ? formatTemplateDate(opts.date) : formatTemplateDate(new Date());
    if (opts.mediaUrl) {
      return {
        key: 'event.announcement_media',
        params: {
          event_title: opts.title,
          event_date: eventDate,
          event_description: desc || opts.title,
          media_url: opts.mediaUrl
        }
      };
    }
    return {
      key: 'event.announcement',
      params: {
        event_title: opts.title,
        event_date: eventDate,
        event_description: desc || opts.title
      }
    };
  }
  return { key: 'announcement.broadcast', params: { custom: desc || opts.title } };
}
import { clearCache } from '../../middlewares/cache.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { audit } from '../../middlewares/audit.middleware';
import { getPresignedDownloadUrl, getPresignedUploadUrl, getMediaType } from '../../services/s3.service';
import { uploadBase64Document } from '../../services/document.service';
import { IEventAttachment } from '../../models/event.model';
import { getPublicOrigin } from '../../utils/publicOrigin';

const router = Router();

// Send (or schedule) a targeted WhatsApp broadcast with optional class/section filters
router.post('/broadcast', requirePermission('events:manage'), audit('broadcast:send'), async (req: Request, res: Response) => {
  try {
    const { title, message, sendAlertsTo, classes, sections, mediaUrls, scheduledAlertTime } = req.body;

    if (!message || !['parents', 'teachers', 'both'].includes(sendAlertsTo)) {
      return res.status(400).json({
        success: false,
        message: 'message and sendAlertsTo ("parents", "teachers" or "both") are required.'
      });
    }
    if ((classes && !Array.isArray(classes)) || (sections && !Array.isArray(sections))) {
      return res.status(400).json({ success: false, message: 'classes and sections must be arrays when provided.' });
    }

    const audience = sendAlertsTo as 'parents' | 'teachers' | 'both';
    const broadcastTitle = title || 'School Announcement';
    const filters: BroadcastFilters = { classes: classes || [], sections: sections || [] };
    const mediaList: string[] = Array.isArray(mediaUrls) ? mediaUrls : [];

    // A /broadcast is always a plain announcement → announcement_broadcast template.
    const alertTemplate = buildAlertTemplate({ type: 'notice', title: broadcastTitle, description: message });

    if (scheduledAlertTime) {
      const scheduledDate = new Date(scheduledAlertTime);
      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ success: false, message: 'scheduledAlertTime is not a valid date.' });
      }
      await ScheduledAlert.create({
        title: broadcastTitle,
        message,
        sendAlertsTo: audience,
        scheduledAt: scheduledDate,
        mediaUrl: mediaList[0],
        mediaUrls: mediaList,
        classes: filters.classes,
        sections: filters.sections,
        templateKey: alertTemplate.key,
        templateParams: alertTemplate.params
      });
      return res.status(200).json({
        success: true,
        message: `Broadcast scheduled for ${scheduledDate.toISOString()}.`
      });
    }

    await executeAlertBroadcast(broadcastTitle, message, audience, undefined, mediaList, filters, alertTemplate);
    return res.status(200).json({ success: true, message: 'Broadcast dispatched successfully.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Create a new event
router.post('/', requirePermission('events:manage'), async (req: Request, res: Response) => {
  try {
    const { title, description, date, media, mediaAttachments, type, sendAlertsTo, classes, sections, scheduledAlertTime } = req.body;

    if (!title || !date) {
      return res.status(400).json({ success: false, message: 'Title and date are required.' });
    }

    let createdEvent: any;

    // Durable attachment metadata (s3Key, not a presigned URL) — see
    // event.model.ts. Source of truth for the permanent public gallery link.
    const attachments: IEventAttachment[] = Array.isArray(mediaAttachments)
      ? mediaAttachments
          .filter((a: any) => a && typeof a.s3Key === 'string' && a.s3Key)
          .map((a: any) => ({
            s3Key: a.s3Key,
            filename: a.filename || String(a.s3Key).split('/').pop() || 'attachment',
            contentType: a.contentType,
            size: typeof a.size === 'number' ? a.size : undefined,
            mediaType: a.mediaType || getMediaType(a.s3Key)
          }))
      : [];

    const event = new Event({
      title,
      description: description || '',
      date: new Date(date),
      media: media || [],
      mediaAttachments: attachments,
      type: type || 'event',
      sendAlertsTo: sendAlertsTo || 'none'
    });
    await event.save();
    createdEvent = event;

    // Handle publishing alerts if specified
    if (sendAlertsTo && sendAlertsTo !== 'none') {
      // The plain templates are text-only (no media header) — for an EVENT
      // with attachments, event_announcement_media carries the PERMANENT
      // gallery link in its own dedicated media_url param (GET
      // /api/events/:eventId/media mints a fresh presigned URL for every
      // attachment on each visit, so the link itself never expires). Pass it
      // as a clean, single-line param — never concatenate it into
      // event_description (Meta rejects embedded newlines in a BODY param
      // with HTTP 400 / code 132018; see buildAlertTemplate's comment).
      const galleryLink =
        type === 'event' && attachments.length > 0 ? `${getPublicOrigin(req)}/api/events/${createdEvent._id}/media` : null;

      // `alertMsg` is kept only for the ScheduledAlert / ERP history record —
      // actual WhatsApp delivery uses the approved template below.
      const alertMsg = `SchoolHub Event: "${title}" is scheduled on ${new Date(date).toLocaleDateString()}. Description: ${description || ''}`;
      const mediaList: string[] = Array.isArray(media) ? media : (media ? [media] : []);
      const audience = sendAlertsTo as 'parents' | 'teachers' | 'both';
      const filters = { classes: classes || [], sections: sections || [] };
      const alertTemplate = buildAlertTemplate({ type, title, description, date, mediaUrl: galleryLink });

      if (scheduledAlertTime) {
        // --- SCHEDULED ALERT ---
        const scheduledDate = new Date(scheduledAlertTime);
        // Persist scheduled alert in MongoDB
        await ScheduledAlert.create({
          title,
          message: alertMsg,
          sendAlertsTo: audience,
          scheduledAt: scheduledDate,
          mediaUrl: mediaList.length > 0 ? mediaList[0] : undefined,
          mediaUrls: mediaList,
          classes: filters.classes,
          sections: filters.sections,
          eventId: createdEvent._id,
          templateKey: alertTemplate.key,
          templateParams: alertTemplate.params
        });
        console.log(`[Scheduler] Alert successfully scheduled for ${scheduledDate.toISOString()}`);
      } else {
        // --- IMMEDIATE ALERT ---
        await executeAlertBroadcast(title, alertMsg, audience, undefined, mediaList, filters, alertTemplate);
      }
    }

    return res.status(201).json({ success: true, data: createdEvent });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get all events
router.get('/', async (req: Request, res: Response) => {
  try {
    const events = await Event.find({}).sort({ date: -1, createdAt: -1 });
    return res.status(200).json({ success: true, data: events });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Presign-only: the browser uploads the file bytes straight to S3 with the
// returned uploadUrl, never through this server. Replaces the old
// base64-over-JSON upload, which forced the whole file through Node twice
// (once as a base64 string in the parsed request body, once again as a
// decoded Buffer) — synchronous work on the single request-handling thread,
// blocking every other user's request for the duration, plus was capped at
// nginx's client_max_body_size (60m, i.e. ~45MB of real file once base64's
// ~33% inflation is accounted for). This endpoint's own body is tiny
// (a filename) regardless of how large the actual upload is.
router.post('/media/presign', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const role = user.role;
    const userPerms: string[] = user.permissions || [];
    const isAllowed = role === 'admin' || role === 'superadmin' || role === 'teacher' ||
      userPerms.includes('events:manage') || userPerms.includes('homework:create');
    if (!isAllowed) {
      return res.status(403).json({ success: false, message: 'Permission denied to upload media.' });
    }

    const { fileName } = req.body;
    if (!fileName || typeof fileName !== 'string') {
      return res.status(400).json({ success: false, message: 'fileName is required.' });
    }

    let isS3Disabled = false;
    const config = await SystemConfig.findOne({ key: 'disableEventS3Storage' });
    if (config) {
      isS3Disabled = config.value === true || config.value === 'true';
    }
    if (isS3Disabled) {
      return res.status(400).json({
        success: false,
        message: 'Event media storage is currently disabled by the administrator.',
      });
    }

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const name = fileName.replace(/\s+/g, '-');
    const year = new Date().getFullYear();
    const s3Key = `events/${year}/${uniqueSuffix}-${name}`;

    const [uploadUrl, previewUrl] = await Promise.all([
      getPresignedUploadUrl(s3Key),
      getPresignedDownloadUrl(s3Key)
    ]);

    return res.status(200).json({
      success: true,
      uploadUrl,
      previewUrl,
      s3Key,
      mediaType: getMediaType(s3Key)
    });
  } catch (error: any) {
    console.error('[Event Media Presign Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Direct server-side upload fallback: if browser direct S3 PUT encounters CORS or network issues
router.post('/media/upload-direct', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const role = user.role;
    const userPerms: string[] = user.permissions || [];
    const isAllowed = role === 'admin' || role === 'superadmin' || role === 'teacher' ||
      userPerms.includes('events:manage') || userPerms.includes('homework:create');
    if (!isAllowed) {
      return res.status(403).json({ success: false, message: 'Permission denied to upload media.' });
    }

    const { fileName, fileData } = req.body;
    if (!fileName || !fileData) {
      return res.status(400).json({ success: false, message: 'fileName and fileData are required.' });
    }

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const name = String(fileName).replace(/\s+/g, '-');
    const year = new Date().getFullYear();
    const s3Key = `events/${year}/${uniqueSuffix}-${name}`;

    const { contentType } = await uploadBase64Document(fileData, s3Key);
    const previewUrl = await getPresignedDownloadUrl(s3Key);

    return res.status(200).json({
      success: true,
      previewUrl,
      s3Key,
      contentType,
      mediaType: getMediaType(s3Key)
    });
  } catch (error: any) {
    console.error('[Event Media Upload Direct Error]:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Delete an event or notice
router.delete('/:id', requirePermission('events:manage'), audit('event:delete'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const event = await Event.findByIdAndDelete(id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event/Notice not found.' });
    }
    // Clean up any pending scheduled alerts associated with this event
    await ScheduledAlert.deleteMany({ eventId: id });
    return res.status(200).json({ success: true, message: 'Event/Notice deleted successfully.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
