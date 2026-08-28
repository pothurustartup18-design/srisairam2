import { Router, Request, Response, NextFunction } from 'express';
import { Feedback } from '../../models/feedback.model';
import { requirePermission } from '../../middlewares/permission.middleware';
import { getEffectivePermissions } from '../../services/permissionEngine';

const router = Router();

// Get all feedbacks (Admin)
router.get('/', requirePermission('feedback:read'), async (req: Request, res: Response) => {
  try {

    const records = await Feedback.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: records });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Reply to a feedback thread (Admin)
// Parent replies (sender !== 'admin') fall through to the parent feedback router,
// which is mounted after this one on the same /api/feedbacks path.
router.post('/:feedbackId/reply', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { feedbackId } = req.params;
    const { sender, text } = req.body;

    if (sender !== 'admin') {
      return next();
    }
    const user = req.user as any;
    if (user?.role !== 'superadmin') {
      const permissions = await getEffectivePermissions(user);
      if (!permissions.includes('feedback:read')) {
        return res.status(403).json({ success: false, message: 'Forbidden: Insufficient privileges. Required permission: feedback:read' });
      }
    }
    if (!text) {
      return res.status(400).json({ success: false, message: 'text is required.' });
    }

    // Real DB Mode
    const record = await Feedback.findById(feedbackId);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Feedback thread not found.' });
    }

    record.messages.push({
      sender: 'admin',
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
