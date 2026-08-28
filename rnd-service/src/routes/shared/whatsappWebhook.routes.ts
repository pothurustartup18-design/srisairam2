/**
 * WhatsApp webhook + health endpoints.
 *
 * GET  /api/whatsapp/webhook  — Meta verification handshake (hub.challenge echo).
 * POST /api/whatsapp/webhook  — event delivery: signature-verified, ACKed
 *                               immediately with 200, processed asynchronously
 *                               (Meta requires a fast 200; retries otherwise).
 * GET  /api/whatsapp/health   — authenticated live health check (token, phone
 *                               number, WABA, webhook status).
 */

import { Router, Request, Response } from 'express';
import { resolveTenantConfig } from '../../config/whatsapp';
import { verifyWebhookSignature, processWebhookPayload } from '../../services/whatsappWebhook.processor';
import { checkWhatsAppHealth } from '../../services/whatsappHealth.service';
import { authenticateJWT } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';

const router = Router();

let missingSecretWarned = false;

// Meta webhook verification handshake
router.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expectedToken = resolveTenantConfig()?.webhookVerifyToken;

  if (!expectedToken) {
    console.warn('[WhatsApp Webhook] Verification attempted but WHATSAPP_WEBHOOK_VERIFY_TOKEN is not configured.');
    return res.status(403).send('Forbidden');
  }

  if (mode === 'subscribe' && token === expectedToken) {
    console.log('[WhatsApp Webhook] Verification successful.');
    return res.status(200).send(challenge);
  }

  console.warn('[WhatsApp Webhook] Verification failed (mode/token mismatch).');
  return res.status(403).send('Forbidden');
});

// Event delivery from Meta
router.post('/webhook', (req: Request, res: Response) => {
  const config = resolveTenantConfig();

  // Signature verification — requires the raw body captured in server.ts
  if (config?.appSecret) {
    const rawBody: Buffer | undefined = (req as any).rawBody;
    const signature = req.header('x-hub-signature-256');
    if (!rawBody || !verifyWebhookSignature(config.appSecret, rawBody, signature)) {
      console.warn('[WhatsApp Webhook] Rejected payload with missing/invalid X-Hub-Signature-256.');
      return res.status(401).send('Invalid signature');
    }
  } else if (process.env.NODE_ENV === 'production') {
    // Without the app secret this endpoint accepts any payload from anyone who
    // knows the (publicly reachable) URL, letting them forge delivery statuses
    // and inbound messages. Tolerable locally; never in production.
    if (!missingSecretWarned) {
      missingSecretWarned = true;
      console.error(
        '[WhatsApp Webhook] WHATSAPP_APP_SECRET is not set — rejecting all webhook deliveries. ' +
          'Set it from Meta App Dashboard > App Settings > Basic > App Secret.'
      );
    }
    return res.status(401).send('Webhook signature verification is not configured');
  } else if (!missingSecretWarned) {
    missingSecretWarned = true;
    console.warn(
      '[WhatsApp Webhook] WHATSAPP_APP_SECRET not set — accepting webhooks WITHOUT signature verification. Configure it for production.'
    );
  }

  // ACK immediately (Meta expects a fast 200 and will retry/disable on errors),
  // then process in the background. processWebhookPayload never throws.
  res.status(200).send('EVENT_RECEIVED');
  setImmediate(() => {
    processWebhookPayload(req.body).catch((err) => {
      console.error('[WhatsApp Webhook] Background processing error:', err);
    });
  });
});

// Live health check — deliberately authenticated: it reveals configuration
// state and calls Meta on every request.
router.get('/health', authenticateJWT, requirePermission('whatsapp:view'), async (_req: Request, res: Response) => {
  try {
    const report = await checkWhatsAppHealth();
    const httpStatus = report.overall === 'error' ? 503 : 200;
    return res.status(httpStatus).json({ success: report.overall !== 'error', data: report });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message || 'Health check failed.' });
  }
});

export default router;
