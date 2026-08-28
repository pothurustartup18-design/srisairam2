import { Router, Request, Response, NextFunction } from 'express';
import { Student } from '../../models/student.model';
import { Teacher } from '../../models/teacher.model';
import { Message } from '../../models/message.model';
import { resolveWhatsAppDelivery, dispatchResolvedDelivery, normalizeAttachments, OutgoingAttachment } from '../../services/whatsapp.service';
import os from 'os';

function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    if (iface) {
      for (const alias of iface) {
        if (alias.family === 'IPv4' && !alias.internal) {
          return alias.address;
        }
      }
    }
  }
  return 'localhost';
}
import { getS3Client, getPresignedDownloadUrl } from '../../services/s3.service';
import { queueNotification } from '../../config/queue';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { convertWebmToOggOpus } from '../../services/audioConvert.service';
import { emitNewMessage } from '../../config/socket';
import { requireOwnStudent, requireOwnTeacher, denyParents } from '../../middlewares/threadAccess.middleware';

const router = Router();

// Local disk isn't a fit for large attachments — it isn't reachable by Meta's
// servers unless the backend has a public hostname, and it bloats the box's disk.
// Files over this size must go to S3, matching how Event media is stored.
const LARGE_FILE_S3_THRESHOLD_BYTES = 10 * 1024 * 1024;

// Upload base64 media (to AWS S3 if configured, else fallback locally to uploads/ folder)
router.post('/upload-media', async (req: Request, res: Response) => {
  try {
    const { fileBase64, filename } = req.body;
    if (!fileBase64 || !filename) {
      return res.status(400).json({ success: false, message: 'fileBase64 and filename are required.' });
    }

    const dataUrlMatch = /^data:([^;,]+)/.exec(fileBase64);
    const detectedMime = dataUrlMatch ? dataUrlMatch[1].toLowerCase() : null;

    const base64Parts = fileBase64.split(',');
    const base64Data = base64Parts.length > 1 ? base64Parts[1] : base64Parts[0];
    let fileBuffer: Buffer = Buffer.from(base64Data, 'base64');
    let finalFilename = filename;

    // Browsers record voice notes as WebM/Opus, but WhatsApp Cloud API only accepts
    // audio/ogg (Opus codec) for playable voice messages — convert before storing.
    if (detectedMime === 'audio/webm' || detectedMime === 'video/webm') {
      fileBuffer = await convertWebmToOggOpus(fileBuffer);
      finalFilename = filename.replace(/\.[^./]+$/, '') + '.ogg';
    }

    if (!process.env.AWS_BUCKET_NAME) {
      return res.status(500).json({
        success: false,
        message: 'AWS S3 bucket name is not configured. Media upload is disabled.'
      });
    }

    const year = new Date().getFullYear();
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const name = finalFilename ? finalFilename.replace(/\s+/g, '-') : 'media.jpg';
    const s3Key = `events/${year}/${uniqueSuffix}-${name}`;

    let contentType = 'application/octet-stream';
    const lowered = finalFilename.toLowerCase();
    if (lowered.endsWith('.png')) contentType = 'image/png';
    else if (lowered.endsWith('.jpg') || lowered.endsWith('.jpeg')) contentType = 'image/jpeg';
    else if (lowered.endsWith('.gif')) contentType = 'image/gif';
    else if (lowered.endsWith('.mp3')) contentType = 'audio/mpeg';
    else if (lowered.endsWith('.m4a')) contentType = 'audio/m4a';
    else if (lowered.endsWith('.wav')) contentType = 'audio/wav';
    else if (lowered.endsWith('.ogg') || lowered.endsWith('.opus')) contentType = 'audio/ogg';
    else if (lowered.endsWith('.mp4')) contentType = 'video/mp4';
    else if (lowered.endsWith('.mov')) contentType = 'video/quicktime';
    else if (lowered.endsWith('.pdf')) contentType = 'application/pdf';

    const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: contentType,
    };

    await getS3Client().send(new PutObjectCommand(uploadParams));
    const fileUrl = await getPresignedDownloadUrl(s3Key);
    console.log(`Uploaded media to AWS S3 (Presigned): ${fileUrl}`);

    return res.status(200).json({
      success: true,
      message: 'Media uploaded successfully.',
      fileUrl,
      size: fileBuffer.length
    });
  } catch (error: any) {
    console.error('Error uploading media:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// `/unread/:type/:id` and `/read/:type/:id` address either kind of thread under a
// generic `:id`, so pick the ownership check from `:type`.
const requireOwnThreadId = (req: Request, res: Response, next: NextFunction) => {
  if (req.params.type === 'teacher') return requireOwnTeacher('id')(req, res, next);
  return requireOwnStudent('id')(req, res, next);
};

// Get all threads (students and teachers with messages)
router.get('/threads', denyParents, async (req: Request, res: Response) => {
  try {

    // DB Mode: get unique studentIds and teacherIds from Message collection
    const studentIds = await Message.distinct('studentId', { studentId: { $ne: null } });
    const teacherIds = await Message.distinct('teacherId', { teacherId: { $ne: null } });

    const studentThreads = await Promise.all(studentIds.map(async (sid) => {
      const student = await Student.findById(sid).lean();
      const lastMsg = await Message.findOne({ studentId: sid }).sort({ createdAt: -1 }).lean();
      const unreadCount = await Message.countDocuments({ studentId: sid, sender: 'parent', recipient: 'admin', read: false });
      return {
        studentId: sid,
        name: student ? `${student.firstName} ${student.lastName}` : 'Unknown Student',
        lastMessage: lastMsg ? lastMsg.text : '',
        unreadCount,
        updatedAt: lastMsg ? lastMsg.createdAt : new Date()
      };
    }));

    const teacherThreads = await Promise.all(teacherIds.map(async (tid) => {
      const teacher = await Teacher.findById(tid).lean();
      const lastMsg = await Message.findOne({ teacherId: tid }).sort({ createdAt: -1 }).lean();
      const unreadCount = await Message.countDocuments({ teacherId: tid, sender: 'teacher', read: false });
      return {
        teacherId: tid,
        name: teacher ? teacher.name : 'Unknown Teacher',
        lastMessage: lastMsg ? lastMsg.text : '',
        unreadCount,
        updatedAt: lastMsg ? lastMsg.createdAt : new Date()
      };
    }));

    return res.status(200).json({ success: true, data: { studentThreads, teacherThreads } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Unread message count for a thread, from the perspective of the caller's role
router.get('/unread/:type/:id', requireOwnThreadId, async (req: Request, res: Response) => {
  try {
    const { type, id } = req.params;
    const userRole = (req.user as any)?.role || 'parent';

    if (type !== 'student' && type !== 'teacher') {
      return res.status(400).json({ success: false, message: 'type must be "student" or "teacher".' });
    }

    let filter: any;
    if (type === 'student') {
      filter = userRole === 'parent'
        ? { studentId: id, sender: { $in: ['admin', 'teacher'] }, read: false }
        : { studentId: id, sender: 'parent', recipient: userRole, read: false };
    } else {
      filter = userRole === 'teacher'
        ? { teacherId: id, sender: 'admin', read: false }
        : { teacherId: id, sender: 'teacher', read: false };
    }

    const count = await Message.countDocuments(filter);
    return res.status(200).json({ success: true, unreadCount: count });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Mark messages as read for a thread
router.patch('/read/:type/:id', requireOwnThreadId, async (req: Request, res: Response) => {
  try {
    const { type, id } = req.params;
    const recipientParam = req.query.recipient as string || 'admin';
    const userRole = (req.user as any)?.role || 'parent';

    if (type === 'student') {
      if (userRole === 'parent') {
        // Parent reading: mark specific sender (admin or teacher) messages as read
        await Message.updateMany({ studentId: id, sender: recipientParam }, { $set: { read: true } });
      } else {
        // Admin/Teacher reading: mark parent messages sent to them as read
        await Message.updateMany({ studentId: id, sender: 'parent', recipient: userRole }, { $set: { read: true } });
      }
    } else if (type === 'teacher') {
      if (userRole === 'teacher') {
        // Teacher reading: mark admin messages as read
        await Message.updateMany({ teacherId: id, sender: 'admin' }, { $set: { read: true } });
      } else {
        // Admin reading: mark teacher messages as read
        await Message.updateMany({ teacherId: id, sender: 'teacher' }, { $set: { read: true } });
      }
    }

    return res.status(200).json({ success: true, message: 'Messages marked as read.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Send a personal message to a student's parent (or from parent to school).
// In-app portal thread only — does NOT touch WhatsApp. For a one-off WhatsApp
// notification to the parent, use POST /student/:studentId/whatsapp instead.
router.post('/student/:studentId', requireOwnStudent(), async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;
    const { text, recipient } = req.body;
    const sender = (req.user as any)?.role || 'parent'; // default to parent if no user (or parent token)
    const userObj = req.user as any || {};
    const senderName = req.body.senderName || [userObj.firstName, userObj.lastName].filter(Boolean).join(' ') || 'Parent';

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Message text is required.' });
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    const message = new Message({
      studentId: student._id.toString(),
      sender,
      recipient: recipient || (sender === 'parent' ? 'admin' : 'parent'),
      senderName,
      text,
      createdAt: new Date()
    });
    await message.save();

    emitNewMessage(message);

    return res.status(201).json({ success: true, data: message });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Resolves (native send, or gallery-bundle for multiple/oversized attachments — see
// resolveWhatsAppDelivery) and sends to a single recipient in one call.
async function sendWhatsAppWithAttachments(
  to: string,
  text: string,
  attachments: OutgoingAttachment[]
): Promise<{ success: boolean; messageIds: string[]; failures: string[]; simulated: boolean }> {
  try {
    const resolved = await resolveWhatsAppDelivery(text, attachments);
    const redisClient = require('../../config/redis').default;
    
    if (redisClient && redisClient.status === 'ready') {
      const { notificationQueue } = require('../../config/queue');
      await notificationQueue.add('sendWhatsAppResolved', { to, resolved });
      console.log(`[Queue] WhatsApp resolved message queued for ${to}`);
      return { success: true, messageIds: [], failures: [], simulated: false };
    } else {
      console.warn(`[Queue] Redis not ready. Falling back to synchronous WhatsApp send.`);
      const result = await dispatchResolvedDelivery(to, resolved);
      if (result.success) {
        return { success: true, messageIds: result.wamid ? [result.wamid] : [], failures: [], simulated: !!result.simulated };
      }
      return { success: false, messageIds: [], failures: [result.error?.reason || 'unknown error'], simulated: false };
    }
  } catch (err: any) {
    return { success: false, messageIds: [], failures: [err.message], simulated: false };
  }
}

// Independent one-off WhatsApp notification to a student's parent — NOT part
// of the in-app Direct Messages thread (nothing is saved to the Message
// collection here; it never appears in the portal inbox). This is what the
// chat-icon shortcut on the Students table uses, kept deliberately separate
// from the threaded portal messaging above.
router.post('/student/:studentId/whatsapp', requireOwnStudent(), async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;
    const { text } = req.body;
    const userObj = req.user as any || {};
    const senderName = req.body.senderName || [userObj.firstName, userObj.lastName].filter(Boolean).join(' ') || 'School';

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Message text is required.' });
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    const whatsappNo = (student as any).whatsappNo;
    if (!whatsappNo) {
      return res.status(400).json({ success: false, message: 'No WhatsApp number on record for this student.' });
    }

    const localIp = getLocalIpAddress();
    let processedText = text.trim();
    if (processedText.includes('localhost')) {
      processedText = processedText.replace(/localhost/g, localIp);
    }
    if (processedText.includes('127.0.0.1')) {
      processedText = processedText.replace(/127\.0\.0\.1/g, localIp);
    }

    const formattedMessage = `💬 Message from ${senderName} (School ERP):\n\n${processedText}`;
    const attachments = normalizeAttachments(req.body);

    const result = await sendWhatsAppWithAttachments(whatsappNo, formattedMessage, attachments);

    if (!result.success) {
      return res.status(502).json({
        success: false,
        message: `WhatsApp message failed: ${result.failures.join('; ') || 'unknown error'}`
      });
    }

    return res.status(200).json({ success: true, message: 'WhatsApp message sent.', messageId: result.messageIds[0], messageIds: result.messageIds, simulated: result.simulated });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// One-off WhatsApp notification to a teacher
router.post('/teacher/:teacherId/whatsapp', requireOwnTeacher(), async (req: Request, res: Response) => {
  try {
    const { teacherId } = req.params;
    const { text } = req.body;
    const userObj = req.user as any || {};
    const senderName = req.body.senderName || [userObj.firstName, userObj.lastName].filter(Boolean).join(' ') || 'School';

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Message text is required.' });
    }

    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found.' });
    }

    const whatsappNo = (teacher as any).phone;
    if (!whatsappNo) {
      return res.status(400).json({ success: false, message: 'No contact phone number on record for this teacher.' });
    }

    const localIp = getLocalIpAddress();
    let processedText = text.trim();
    if (processedText.includes('localhost')) {
      processedText = processedText.replace(/localhost/g, localIp);
    }
    if (processedText.includes('127.0.0.1')) {
      processedText = processedText.replace(/127\.0\.0\.1/g, localIp);
    }

    const formattedMessage = `💬 Message from ${senderName} (School ERP):\n\n${processedText}`;
    const attachments = normalizeAttachments(req.body);

    const result = await sendWhatsAppWithAttachments(whatsappNo, formattedMessage, attachments);

    if (!result.success) {
      return res.status(502).json({
        success: false,
        message: `WhatsApp message failed: ${result.failures.join('; ') || 'unknown error'}`
      });
    }

    return res.status(200).json({ success: true, message: 'WhatsApp message sent.', messageId: result.messageIds[0], messageIds: result.messageIds, simulated: result.simulated });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Retrieve messages sent to/from a student
router.get('/student/:studentId', requireOwnStudent(), async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;
    const recipientParam = req.query.recipient as string || 'admin';
    const userRole = (req.user as any)?.role || 'parent';

    let filter: any = { studentId };
    if (userRole === 'parent') {
      if (recipientParam !== 'all') {
        filter.$or = [
          { sender: recipientParam },
          { recipient: recipientParam }
        ];
      }
    } else {
      filter.$or = [
        { sender: userRole },
        { recipient: userRole }
      ];
    }

    const messages = await Message.find(filter).sort({ createdAt: 1 });
    return res.status(200).json({ success: true, data: messages });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Send a personal message to a teacher (or from teacher to admin)
router.post('/teacher/:teacherId', requireOwnTeacher(), async (req: Request, res: Response) => {
  try {
    const { teacherId } = req.params;
    const { text } = req.body;
    const sender = (req.user as any)?.role || 'teacher';
    const userObj = req.user as any || {};
    const senderName = req.body.senderName || userObj.name || 'Teacher';

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Message text is required.' });
    }

    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found.' });
    }

    const message = new Message({
      teacherId: teacher._id.toString(),
      sender,
      senderName,
      text,
      createdAt: new Date()
    });
    await message.save();

    emitNewMessage(message);

    return res.status(201).json({ success: true, data: message });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Retrieve messages sent to/from a teacher
router.get('/teacher/:teacherId', requireOwnTeacher(), async (req: Request, res: Response) => {
  try {
    const { teacherId } = req.params;

    const messages = await Message.find({ teacherId }).sort({ createdAt: 1 });
    return res.status(200).json({ success: true, data: messages });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
