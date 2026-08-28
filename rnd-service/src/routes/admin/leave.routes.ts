import { Router, Request, Response, NextFunction } from 'express';
import { Leave } from '../../models/leave.model';
import { requireRole } from '../../middlewares/auth.middleware';

const router = Router();

// List all leave requests (Admin)
router.get('/', requireRole(['admin']), async (req: Request, res: Response) => {
  try {

    const records = await Leave.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: records });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Approve or Reject a leave application (Admin)
router.patch('/:leaveId', requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const { leaveId } = req.params;
    const { status } = req.body;

    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status ("approved" or "rejected") is required.',
      });
    }

    const record = await Leave.findByIdAndUpdate(
      leaveId,
      { status },
      { new: true }
    );

    if (!record) {
      return res.status(404).json({ success: false, message: 'Leave request not found.' });
    }

    return res.status(200).json({
      success: true,
      message: `Leave application status set to "${status}".`,
      data: record,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Admin comments/reply messages on a leave request
// Teacher messages (sender !== 'admin') fall through to the teacher leave router,
// which is mounted after this one on the same /api/leaves path.
router.post('/:leaveId/message', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { leaveId } = req.params;
    const { sender, senderName, text } = req.body;

    if (sender !== 'admin') {
      return next();
    }
    if ((req.user as any)?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden: Only admins can comment as "admin".' });
    }
    if (!senderName || !text) {
      return res.status(400).json({
        success: false,
        message: 'senderName and text are required.',
      });
    }

    const record = await Leave.findById(leaveId);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Leave request not found.' });
    }

    record.messages.push({
      sender: 'admin',
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
