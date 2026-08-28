/**
 * WhatsApp webhook processing — signature verification, duplicate protection,
 * and idempotent message-status tracking. Kept separate from the Express route
 * so the logic is unit-testable and never depends on req/res.
 */

import crypto from 'crypto';
import { WhatsAppMessage, statusTransitionAllowed, WhatsAppMessageStatus } from '../models/whatsappMessage.model';
import { Student } from '../models/student.model';
import { Teacher } from '../models/teacher.model';

// ─── Signature verification (X-Hub-Signature-256) ───────────────────────────

/**
 * Verify Meta's HMAC-SHA256 webhook signature against the raw request body.
 * Timing-safe. Returns false for missing/malformed headers.
 */
export function verifyWebhookSignature(appSecret: string, rawBody: Buffer | string, signatureHeader?: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  try {
    const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const received = signatureHeader.slice('sha256='.length);
    const expectedBuf = Buffer.from(expected, 'hex');
    const receivedBuf = Buffer.from(received, 'hex');
    if (expectedBuf.length !== receivedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}

// ─── Duplicate webhook protection (Meta retries deliveries) ──────────────────

const SEEN_EVENT_TTL_MS = 15 * 60 * 1000;
const SEEN_EVENT_MAX = 5000;
const seenEvents = new Map<string, number>();

/** True the first time an event key is seen within the TTL window. */
export function markEventSeen(key: string): boolean {
  const now = Date.now();
  if (seenEvents.size > SEEN_EVENT_MAX) {
    for (const [k, ts] of seenEvents) {
      if (now - ts > SEEN_EVENT_TTL_MS) seenEvents.delete(k);
    }
    // still oversized after TTL cleanup → drop oldest entries
    if (seenEvents.size > SEEN_EVENT_MAX) {
      const excess = seenEvents.size - SEEN_EVENT_MAX;
      let dropped = 0;
      for (const k of seenEvents.keys()) {
        seenEvents.delete(k);
        if (++dropped >= excess) break;
      }
    }
  }
  const prev = seenEvents.get(key);
  if (prev !== undefined && now - prev < SEEN_EVENT_TTL_MS) return false;
  seenEvents.set(key, now);
  return true;
}

/** Test hook. */
export function _clearSeenEvents(): void {
  seenEvents.clear();
}

// ─── Observability for health checks ─────────────────────────────────────────

let lastWebhookAt: Date | null = null;
let lastStatusUpdateAt: Date | null = null;

export function getWebhookStats() {
  return { lastWebhookAt, lastStatusUpdateAt };
}

// ─── Payload processing ───────────────────────────────────────────────────────

function log(event: string, fields: Record<string, unknown>): void {
  console.log('[WhatsApp Webhook]', JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

const WEBHOOK_STATUS_MAP: Record<string, WhatsAppMessageStatus> = {
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
  failed: 'failed'
};

/**
 * Apply a delivery-status update from Meta to our message record.
 * Idempotent: statuses only move forward (see statusTransitionAllowed), so
 * replayed or out-of-order webhooks are harmless.
 */
async function applyStatusUpdate(status: any): Promise<void> {
  const wamid: string | undefined = status?.id;
  const mapped = WEBHOOK_STATUS_MAP[status?.status];
  if (!wamid || !mapped) return;

  lastStatusUpdateAt = new Date();

  if (!markEventSeen(`status:${wamid}:${status.status}`)) {
    return; // duplicate webhook delivery
  }

  const errorInfo = Array.isArray(status?.errors) && status.errors.length > 0 ? status.errors[0] : undefined;
  log('status_update', {
    wamid,
    status: status.status,
    recipient: status?.recipient_id,
    errorCode: errorInfo?.code,
    errorTitle: errorInfo?.title
  });

  try {
    const record = await WhatsAppMessage.findOne({ wamid });
    if (!record) {
      log('status_for_unknown_message', { wamid, status: status.status });
      return;
    }
    if (!statusTransitionAllowed(record.status, mapped)) return;

    record.status = mapped;
    record.statusHistory.push({ status: mapped, at: new Date(), source: 'webhook' });
    if (mapped === 'failed' && errorInfo) {
      record.error = {
        code: errorInfo.code,
        title: errorInfo.title,
        message: errorInfo.message || errorInfo.error_data?.details,
        retryable: false
      };
    }
    if (status?.conversation?.id) record.conversationId = status.conversation.id;
    if (status?.pricing?.category) record.pricingCategory = status.pricing.category;
    await record.save();
  } catch (err: any) {
    console.error('[WhatsApp Webhook] Failed to persist status update:', err?.message);
  }
}

/** Handle an inbound user message (kept from previous behavior: log + identify sender). */
async function applyInboundMessage(messageObj: any): Promise<void> {
  const from: string | undefined = messageObj?.from;
  const messageId: string | undefined = messageObj?.id;
  if (!from) return;

  if (messageId && !markEventSeen(`msg:${messageId}`)) {
    return; // duplicate webhook delivery
  }

  let text = '';
  if (messageObj.type === 'text') {
    text = messageObj.text?.body || '';
  } else if (messageObj.type === 'interactive') {
    text = messageObj.interactive?.button_reply?.title || messageObj.interactive?.list_reply?.title || '';
  } else if (messageObj.type === 'button') {
    text = messageObj.button?.text || '';
  } else {
    text = `[Media: ${messageObj.type}]`;
  }

  log('inbound_message', { from, type: messageObj.type, messageId });

  if (!text) return;

  try {
    const cleanFrom = from.replace(/\D/g, '');
    const last10 = cleanFrom.slice(-10);

    const [students, teachers] = await Promise.all([
      Student.find({
        $or: [
          { whatsappNo: cleanFrom },
          { whatsappNo: `+${cleanFrom}` },
          { whatsappNo: { $regex: `${last10}$` } },
          { motherWhatsappNo: cleanFrom },
          { motherWhatsappNo: `+${cleanFrom}` },
          { motherWhatsappNo: { $regex: `${last10}$` } }
        ]
      }),
      Teacher.find({
        $or: [{ phone: cleanFrom }, { phone: `+${cleanFrom}` }, { phone: { $regex: `${last10}$` } }]
      })
    ]);

    for (const student of students) {
      log('inbound_from_parent', { student: `${student.firstName} ${student.lastName}` });
    }
    for (const teacher of teachers) {
      log('inbound_from_teacher', { teacher: teacher.name });
    }
    if (students.length === 0 && teachers.length === 0) {
      log('inbound_from_unmapped_number', { from });
    }
  } catch (err: any) {
    console.error('[WhatsApp Webhook] Failed to match inbound sender:', err?.message);
  }
}

/**
 * Process a full webhook payload. Iterates EVERY entry/change/message/status
 * (Meta batches multiple events per delivery). Never throws.
 */
export async function processWebhookPayload(body: any): Promise<void> {
  lastWebhookAt = new Date();
  try {
    if (body?.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change?.value;
        if (!value) continue;

        for (const status of value.statuses || []) {
          await applyStatusUpdate(status);
        }
        for (const message of value.messages || []) {
          await applyInboundMessage(message);
        }
      }
    }
  } catch (err: any) {
    console.error('[WhatsApp Webhook] Unexpected error processing payload:', err?.message);
  }
}
