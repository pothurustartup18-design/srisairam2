import { Router, Request, Response } from 'express';
import { Event } from '../../models/event.model';
import { ScheduledAlert } from '../../models/scheduledAlert.model';
import { SystemConfig } from '../../models/systemConfig.model';
import { executeAlertBroadcast, BroadcastFilters } from '../../services/scheduler';
import { requirePermission } from '../../middlewares/permission.middleware';
import { audit } from '../../middlewares/audit.middleware';
import { getS3Client, getPresignedDownloadUrl } from '../../services/s3.service';
import { PutObjectCommand } from '@aws-sdk/client-s3';

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
        sections: filters.sections
      });
      return res.status(200).json({
        success: true,
        message: `Broadcast scheduled for ${scheduledDate.toISOString()}.`
      });
    }

    await executeAlertBroadcast(broadcastTitle, message, audience, undefined, mediaList, filters);
    return res.status(200).json({ success: true, message: 'Broadcast dispatched successfully.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Create a new event
router.post('/', requirePermission('events:manage'), async (req: Request, res: Response) => {
  try {
    const { title, description, date, media, type, sendAlertsTo, classes, sections, scheduledAlertTime } = req.body;

    if (!title || !date) {
      return res.status(400).json({ success: false, message: 'Title and date are required.' });
    }

    let createdEvent: any;

    const event = new Event({
      title,
      description: description || '',
      date: new Date(date),
      media: media || [],
      type: type || 'event',
      sendAlertsTo: sendAlertsTo || 'none'
    });
    await event.save();
    createdEvent = event;

    // Handle publishing alerts if specified
    if (sendAlertsTo && sendAlertsTo !== 'none') {
      const alertMsg = `SchoolHub Event: "${title}" is scheduled on ${new Date(date).toLocaleDateString()}. Description: ${description || ''}`;
      const mediaList: string[] = Array.isArray(media) ? media : (media ? [media] : []);
      const audience = sendAlertsTo as 'parents' | 'teachers' | 'both';
      const filters = { classes: classes || [], sections: sections || [] };

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
          eventId: createdEvent._id
        });
        console.log(`[Scheduler] Alert successfully scheduled for ${scheduledDate.toISOString()}`);
      } else {
        // --- IMMEDIATE ALERT ---
        await executeAlertBroadcast(title, alertMsg, audience, undefined, mediaList, filters);
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
    const events = await Event.find({}).sort({ date: 1 });
    return res.status(200).json({ success: true, data: events });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/media/upload', requirePermission('events:manage'), async (req: Request, res: Response) => {
  try {
    const { fileName, mediaBase64 } = req.body;

    if (mediaBase64) {
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
      // Decode base64 data
      const base64Parts = mediaBase64.split(',');
      const base64Data = base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];
      
      // Determine content type
      let contentType = 'image/jpeg';
      const mimeMatch = mediaBase64.match(/^data:([^;]+);/);
      if (mimeMatch) {
        contentType = mimeMatch[1];
      }

      const fileBuffer = Buffer.from(base64Data, 'base64');
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const name = fileName ? fileName.replace(/\s+/g, '-') : 'media.jpg';
      const year = new Date().getFullYear();
      const s3Key = `events/${year}/${uniqueSuffix}-${name}`;

      const uploadParams = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: contentType,
      };

      await getS3Client().send(new PutObjectCommand(uploadParams));
      const s3Url = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-southeast-2'}.amazonaws.com/${s3Key}`;
      console.log(`Saved event media to AWS S3: ${s3Url}`);

      const presignedUrl = await getPresignedDownloadUrl(s3Key);

      return res.status(200).json({
        success: true,
        message: 'Media uploaded successfully to S3.',
        url: presignedUrl,
      });
    }

    return res.status(400).json({ success: false, message: 'No media data provided.' });
  } catch (error: any) {
    console.error('[Event Media Upload Error]:', error);
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
