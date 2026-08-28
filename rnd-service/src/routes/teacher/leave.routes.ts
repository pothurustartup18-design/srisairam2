import { Router, Request, Response } from 'express';
import { Leave } from '../../models/leave.model';
import { requireRole } from '../../middlewares/auth.middleware';

const router = Router();

// Submit a new Leave Request (Teacher)
router.post('/', requireRole(['teacher']), async (req: Request, res: Response) => {
  try {
    const { teacherId, teacherName, description, fromDate, toDate } = req.body;

    if (!teacherId || !teacherName || !description || !fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: 'teacherId, teacherName, description, fromDate, and toDate are required.',
      });
    }
    if (new Date(toDate) < new Date(fromDate)) {
      return res.status(400).json({ success: false, message: 'toDate cannot be before fromDate.' });
    }

    const newLeave = new Leave({
      teacher: teacherId,
      teacherName,
      description,
      fromDate: new Date(fromDate),
      toDate: new Date(toDate),
      status: 'pending',
      messages: [],
    });
    await newLeave.save();

    return res.status(201).json({
      success: true,
      message: 'Leave application submitted successfully.',
      data: newLeave,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// List leave history for a teacher
router.get('/teacher/:teacherId', requireRole(['teacher', 'admin']), async (req: Request, res: Response) => {
  try {
    const { teacherId } = req.params;

    const records = await Leave.find({ teacher: teacherId }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: records });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Teacher comments/reply messages on a leave request
// (admin messages on the same path are handled by the admin leave router, mounted first)
router.post('/:leaveId/message', async (req: Request, res: Response) => {
  try {
    const { leaveId } = req.params;
    const { sender, senderName, text } = req.body;

    if (!sender || !senderName || !text || sender !== 'teacher') {
      return res.status(400).json({
        success: false,
        message: 'sender ("teacher"), senderName, and text are required.',
      });
    }
    if ((req.user as any)?.role !== 'teacher') {
      return res.status(403).json({ success: false, message: 'Forbidden: Only teachers can comment as "teacher".' });
    }

    const record = await Leave.findById(leaveId);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Leave request not found.' });
    }

    record.messages.push({
      sender: 'teacher',
      senderName,
      text,
      createdAt: new Date(),
    });
    await record.save();

    return res.status(200).json({ success: true, data: record });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
