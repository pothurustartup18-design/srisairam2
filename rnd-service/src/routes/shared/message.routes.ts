import { Router, Request, Response, NextFunction } from 'express';
import { Student } from '../../models/student.model';
import { Teacher } from '../../models/teacher.model';
import { Message } from '../../models/message.model';
import { queueNotification } from '../../config/queue';
import { emitNewMessage } from '../../config/socket';
import { requireOwnStudent, requireOwnTeacher, denyParents } from '../../middlewares/threadAccess.middleware';

const router = Router();

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
// In-app portal thread only — does NOT touch WhatsApp. A free-form WhatsApp
// notification used to be available here too (POST /student/:studentId/whatsapp),
// but Meta silently drops business-initiated free-form text outside a 24h
// reply window with no approved template behind it — removed; the admin-side
// "Message Parent" action now opens a wa.me chat instead (see AdminPortal.tsx's
// openWhatsAppChat), sent from the admin's own WhatsApp account rather than
// through the Business API, which isn't subject to that restriction.
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
