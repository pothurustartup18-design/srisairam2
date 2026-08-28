import { Router, Request, Response } from 'express';
import { Feedback } from '../../models/feedback.model';
import { requirePermission } from '../../middlewares/permission.middleware';

const router = Router();

// Create a new Feedback thread (Parent)
router.post('/', requirePermission('feedback:create'), async (req: Request, res: Response) => {
  try {
    const { studentId, studentName, admissionNo, subject, text, message } = req.body;
    const feedbackText = text || message;

    if (!studentId || !studentName || !admissionNo || !subject || !feedbackText) {
      return res.status(400).json({
        success: false,
        message: 'studentId, studentName, admissionNo, subject, and text/message are required.',
      });
    }

    const messageObj = {
      sender: 'parent' as const,
      text: feedbackText,
      createdAt: new Date(),
    };

    // Real DB Mode
    const newFeedback = new Feedback({
      student: studentId,
      studentName,
      admissionNo,
      subject,
      messages: [messageObj],
    });
    await newFeedback.save();

    return res.status(201).json({ success: true, data: newFeedback });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get feedbacks for a student (Parent)
router.get(['/parent/:studentId', '/student/:studentId'], requirePermission('feedback:read'), async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;

    const records = await Feedback.find({ student: studentId }).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: records });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Reply to a feedback thread (Parent)
router.post('/:feedbackId/reply', requirePermission('feedback:create'), async (req: Request, res: Response) => {
  try {
    const { feedbackId } = req.params;
    const { sender, text } = req.body;

    if (!sender || !text || sender !== 'parent') {
      return res.status(400).json({
        success: false,
        message: 'sender ("parent") and text are required.',
      });
    }

    // Real DB Mode
    const record = await Feedback.findById(feedbackId);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Feedback thread not found.' });
    }

    record.messages.push({
      sender: 'parent',
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
