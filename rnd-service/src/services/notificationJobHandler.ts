/**
 * Dispatch logic for `notificationQueue` jobs, kept separate from config/worker.ts
 * (which instantiates the live BullMQ Worker + Redis connection) so it can be
 * unit-tested without Redis.
 *
 * A job that throws is retried by BullMQ per NOTIFICATION_JOB_OPTIONS.
 */

import {
  sendWhatsAppAuto,
  sendWhatsAppMediaDetailed,
  dispatchResolvedDelivery,
  sendWhatsAppTemplate
} from './whatsapp.service';

export interface NotificationJob {
  id?: string | number | null;
  name: string;
  data: any;
}

export async function processNotificationJob(job: NotificationJob): Promise<void> {
  console.log(`[Worker] Started processing notification job ${job.id} (Type: ${job.name})`);
  try {
    if (job.name === 'sendWhatsAppText') {
      const { to, text } = job.data;
      const success = await sendWhatsAppAuto(to, text);
      if (!success) throw new Error('WhatsApp text send failed');
    } else if (job.name === 'sendWhatsAppMedia') {
      const { to, mediaUrl, type, filename, caption } = job.data;
      const result = await sendWhatsAppMediaDetailed(to, mediaUrl, type, filename, caption);
      if (!result.success) throw new Error(`WhatsApp media send failed: ${result.error?.reason || 'unknown'}`);
    } else if (job.name === 'sendWhatsAppResolved') {
      const { to, resolved } = job.data;
      const result = await dispatchResolvedDelivery(to, resolved);
      if (!result.success) throw new Error(`WhatsApp resolved send failed: ${result.error?.reason || 'unknown'}`);
    } else if (job.name === 'sendWhatsAppTemplate') {
      const { to, templateName, languageCode, named, dedupeKey, header } = job.data;
      const result = await sendWhatsAppTemplate(to, templateName, languageCode, named || {}, {
        dedupeKey,
        ...(header ? { templateHeader: header } : {})
      });
      if (!result.success) throw new Error(`WhatsApp template send failed: ${result.error?.reason || 'unknown'}`);
    } else {
      console.warn(`[Worker] Unknown notification job type "${job.name}" — ignoring.`);
    }
    console.log(`[Worker] Successfully completed notification job ${job.id}`);
  } catch (err: any) {
    console.error(`[Worker] Failed notification job ${job.id}:`, err.message);
    throw err;
  }
}
