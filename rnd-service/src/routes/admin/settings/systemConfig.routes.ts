import { Router, Request, Response } from 'express';
import { requireRole } from '../../../middlewares/auth.middleware';
import { requirePermission } from '../../../middlewares/permission.middleware';
import { audit } from '../../../middlewares/audit.middleware';
import { invalidateTemplateCache } from '../../../services/template.service';
import { SystemConfig } from '../../../models/systemConfig.model';
import { cacheResponse, clearCache } from '../../../middlewares/cache.middleware';

const router = Router();

router.get('/whatsapp-quota', requireRole(['admin', 'teacher']), async (req: Request, res: Response) => {
  try {
    let limit = 100;
    let count = 0;
    let whatsappLimitConfig = await SystemConfig.findOne({ key: 'whatsappLimit' });
    if (!whatsappLimitConfig) {
      whatsappLimitConfig = await SystemConfig.create({ key: 'whatsappLimit', value: 100 });
    }
    let whatsappSentCountConfig = await SystemConfig.findOne({ key: 'whatsappSentCount' });
    if (!whatsappSentCountConfig) {
      whatsappSentCountConfig = await SystemConfig.create({ key: 'whatsappSentCount', value: 0 });
    }
    limit = Number(whatsappLimitConfig.value) || 100;
    count = Number(whatsappSentCountConfig.value) || 0;
    return res.status(200).json({ success: true, count, limit });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/system-config', requireRole(['admin', 'teacher']), cacheResponse(300), async (req: Request, res: Response) => {
  try {

    let marksConfig = await SystemConfig.findOne({ key: 'marksUpdateEnabledClasses' });
    if (!marksConfig) {
      marksConfig = await SystemConfig.create({ key: 'marksUpdateEnabledClasses', value: ['10', '9', '8'] });
    }

    let eventStorageConfig = await SystemConfig.findOne({ key: 'disableEventS3Storage' });
    if (!eventStorageConfig) {
      eventStorageConfig = await SystemConfig.create({ key: 'disableEventS3Storage', value: false });
    }

    let attendanceModeConfig = await SystemConfig.findOne({ key: 'attendanceMode' });
    if (!attendanceModeConfig) {
      attendanceModeConfig = await SystemConfig.create({ key: 'attendanceMode', value: 'full' });
    }

    let whatsappLimitConfig = await SystemConfig.findOne({ key: 'whatsappLimit' });
    if (!whatsappLimitConfig) {
      whatsappLimitConfig = await SystemConfig.create({ key: 'whatsappLimit', value: 100 });
    }

    let whatsappSentCountConfig = await SystemConfig.findOne({ key: 'whatsappSentCount' });
    if (!whatsappSentCountConfig) {
      whatsappSentCountConfig = await SystemConfig.create({ key: 'whatsappSentCount', value: 0 });
    }

    return res.status(200).json({
      success: true,
      data: {
        marksUpdateEnabledClasses: marksConfig.value,
        disableEventS3Storage: eventStorageConfig.value,
        attendanceMode: attendanceModeConfig.value,
        whatsappLimit: whatsappLimitConfig.value,
        whatsappSentCount: whatsappSentCountConfig.value
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/system-config', requireRole(['admin']), requirePermission('settings:manage'), audit('settings:config-update'), async (req: Request, res: Response) => {
  try {
    const { key, value } = req.body;
    if (!key) {
      return res.status(400).json({ success: false, message: 'Key is required.' });
    }

    await SystemConfig.findOneAndUpdate(
      { key },
      { key, value },
      { upsert: true, new: true }
    );

    // Message templates are cached in memory — refresh immediately on change
    if (key === 'messageTemplates') {
      invalidateTemplateCache();
    }

    await clearCache('/api/settings/system-config*');

    return res.status(200).json({ success: true, message: 'Configuration updated successfully.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/system-config/all', requireRole(['superadmin']), async (req: Request, res: Response) => {
  try {
    const configs = await SystemConfig.find({}).sort({ key: 1 }).lean();
    return res.status(200).json({ success: true, data: configs });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/system-config/:key', requireRole(['superadmin']), audit('settings:config-delete'), async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const deleted = await SystemConfig.findOneAndDelete({ key });
    if (!deleted) {
      return res.status(404).json({ success: false, message: `Config key "${key}" not found.` });
    }
    await clearCache('/api/settings/system-config*');
    return res.status(200).json({ success: true, message: `Config "${key}" deleted successfully.` });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
