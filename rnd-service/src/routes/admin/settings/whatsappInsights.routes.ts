import { Router, Request, Response } from 'express';
import { requireRole } from '../../../middlewares/auth.middleware';
import { audit } from '../../../middlewares/audit.middleware';
import {
  buildWhatsAppInsights,
  buildAdminWhatsAppInsights,
  isWhatsAppInsightsEnabled,
  setWhatsAppInsightsEnabled,
  updateWhatsAppPricing,
  resetWhatsAppBillingCycle
} from '../../../services/whatsappInsights.service';

const router = Router();

// Whether the Insights section should render. Readable by admin & superadmin so UI can reflect state.
router.get('/whatsapp-insights/toggle', requireRole(['admin']), async (_req: Request, res: Response) => {
  try {
    const enabled = await isWhatsAppInsightsEnabled();
    return res.status(200).json({ success: true, enabled });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Superadmin-only: enable or disable WhatsApp Insights for the school admin portal
router.post('/whatsapp-insights/toggle', requireRole(['superadmin']), audit('whatsapp-insights:toggle'), async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    await setWhatsAppInsightsEnabled(!!enabled);
    return res.status(200).json({ success: true, enabled: !!enabled });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Superadmin-only: update markup percentage and/or base price
router.post('/whatsapp-insights/pricing', requireRole(['superadmin']), audit('whatsapp-insights:pricing'), async (req: Request, res: Response) => {
  try {
    const { utilityMarkupPercent, marketingMarkupPercent, utilityBasePrice, marketingBasePrice } = req.body;
    await updateWhatsAppPricing({
      utilityMarkupPercent: utilityMarkupPercent !== undefined ? Number(utilityMarkupPercent) : undefined,
      marketingMarkupPercent: marketingMarkupPercent !== undefined ? Number(marketingMarkupPercent) : undefined,
      utilityBasePrice: utilityBasePrice !== undefined ? Number(utilityBasePrice) : undefined,
      marketingBasePrice: marketingBasePrice !== undefined ? Number(marketingBasePrice) : undefined
    });
    const data = await buildWhatsAppInsights();
    return res.status(200).json({ success: true, message: 'WhatsApp pricing updated successfully.', data });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Superadmin-only: reset billing cycle / clear message count & billing amount to start fresh from 0
router.post('/whatsapp-insights/reset-billing', requireRole(['superadmin']), audit('whatsapp-insights:reset-billing'), async (_req: Request, res: Response) => {
  try {
    await resetWhatsAppBillingCycle();
    const data = await buildWhatsAppInsights();
    return res.status(200).json({ success: true, message: 'Billing cycle reset successfully. Counters and cost have been reset to 0.', data });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Admin-accessible summary: sanitized for school admins (inflated total costs only; no base rates or markups)
router.get('/whatsapp-insights/admin-summary', requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const enabled = await isWhatsAppInsightsEnabled();
    const userRole = (req.user as any)?.role;
    if (!enabled && userRole !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'WhatsApp Insights is currently disabled.' });
    }
    const data = await buildAdminWhatsAppInsights();
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Superadmin-only: full breakdown with base price, markup, unit price, and estimated cost
router.get('/whatsapp-insights', requireRole(['superadmin']), async (_req: Request, res: Response) => {
  try {
    const data = await buildWhatsAppInsights();
    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
