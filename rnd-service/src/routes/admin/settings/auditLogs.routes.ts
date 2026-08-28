import { Router, Request, Response } from 'express';
import { requireRole } from '../../../middlewares/auth.middleware';
import { requirePermission } from '../../../middlewares/permission.middleware';
import { audit } from '../../../middlewares/audit.middleware';
import { AuditLog } from '../../../models/auditLog.model';

const router = Router();

router.get('/audit-logs', requireRole(['admin']), requirePermission('settings:manage'), async (req: Request, res: Response) => {
  try {

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const filter: any = {};
    if (req.query.action) filter.action = { $regex: new RegExp(`^${String(req.query.action)}`, 'i') };
    if (req.query.username) filter.username = String(req.query.username);

    const [total, logs] = await Promise.all([
      AuditLog.countDocuments(filter),
      AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean()
    ]);

    return res.status(200).json({ success: true, total, page, limit, data: logs });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
