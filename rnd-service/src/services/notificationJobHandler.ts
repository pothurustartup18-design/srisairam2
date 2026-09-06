/**
 * Dispatch logic for `notificationQueue` jobs, kept separate from config/worker.ts
 * (which instantiates the live BullMQ Worker + Redis connection) so it can be
 * unit-tested without Redis.
 *
 * Retry policy (see also whatsapp.service.ts `classifySendError`):
 *  - The send functions already retry TRANSIENT Meta errors in-process
 *    (network / HTTP 429 / HTTP 5xx / transient Meta codes) up to WHATSAPP_MAX_RETRIES.
 *  - When a job STILL fails, this handler decides whether BullMQ should retry the
 *    whole job:
 *      · error.retryable === false  → deterministic / configuration error
 *        (template not approved, parameter mismatch, invalid recipient, template
 *        disabled/paused, re-engagement required, …). We log it in full and
 *        RETURN — the job completes, the WhatsAppMessage is already recorded as
 *        `failed`, and BullMQ does NOT retry. This is what stops a
 *        rejected/misconfigured template from looping forever.
 *      · error.retryable !== false  → genuinely transient at the job level →
 *        THROW so BullMQ retries per NOTIFICATION_JOB_OPTIONS.
 */

import {
  sendWhatsAppAuto,
  sendWhatsAppMediaDetailed,
  dispatchResolvedDelivery,
  sendWhatsAppTemplate
} from './whatsapp.service';
import type { WhatsAppSendResult } from './whatsapp.service';

export interface NotificationJob {
  id?: string | number | null;
  name: string;
  data: any;
}

/**
 * Given a failed send result, either throw (BullMQ retries) or return quietly
 * (permanent failure — already recorded, never retried). Never hides the Meta
 * error behind a generic message.
 */
function handleSendResult(
  result: WhatsAppSendResult,
  ctx: { job: NotificationJob['id']; kind: string; to: string; templateName?: string }
): void {
  if (result.success) return;

  const e = result.error;
  const detail = {
    job: ctx.job,
    kind: ctx.kind,
    ...(ctx.templateName ? { templateName: ctx.templateName } : {}),
    to: ctx.to,
    httpStatus: e?.httpStatus ?? null,
    metaCode: e?.code ?? null,
    metaSubcode: e?.subcode ?? null,
    metaTitle: e?.title ?? null,
    metaMessage: e?.message ?? null,
    reason: e?.reason ?? 'unknown',
    retryable: e?.retryable ?? null
  };

  if (e && e.retryable === false) {
    console.error(
      `[Worker] PERMANENT WhatsApp failure — NOT retrying (deterministic/config error): ${JSON.stringify(detail)}`
    );
    return; // job completes; WhatsAppMessage already marked failed by dispatch()
  }

  console.warn(`[Worker] Transient WhatsApp failure — will retry: ${JSON.stringify(detail)}`);
  throw new Error(`WhatsApp ${ctx.kind} send failed (transient): ${e?.reason || 'unknown'}`);
}

export async function processNotificationJob(job: NotificationJob): Promise<void> {
  console.log(`[Worker] Started processing notification job ${job.id} (Type: ${job.name})`);
  try {
    if (job.name === 'sendWhatsAppText') {
      // Legacy free-form path (URL-aware: routes PDF/image links to media sends).
      const { to, text } = job.data;
      const success = await sendWhatsAppAuto(to, text);
      if (!success) throw new Error('WhatsApp text send failed');
    } else if (job.name === 'sendWhatsAppMedia') {
      const { to, mediaUrl, type, filename, caption } = job.data;
      handleSendResult(await sendWhatsAppMediaDetailed(to, mediaUrl, type, filename, caption), {
        job: job.id,
        kind: 'media',
        to
      });
    } else if (job.name === 'sendWhatsAppResolved') {
      const { to, resolved } = job.data;
      handleSendResult(await dispatchResolvedDelivery(to, resolved), { job: job.id, kind: 'resolved', to });
    } else if (job.name === 'sendWhatsAppTemplate') {
      const { to, templateName, languageCode, named, dedupeKey, header } = job.data;
      const result = await sendWhatsAppTemplate(to, templateName, languageCode, named || {}, {
        dedupeKey,
        ...(header ? { templateHeader: header } : {})
      });
      handleSendResult(result, { job: job.id, kind: 'template', to, templateName });
    } else {
      console.warn(`[Worker] Unknown notification job type "${job.name}" — ignoring.`);
    }
    console.log(`[Worker] Successfully completed notification job ${job.id}`);
  } catch (err: any) {
    console.error(`[Worker] Failed notification job ${job.id}:`, err.message);
    throw err;
  }
}
