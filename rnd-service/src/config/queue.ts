import { Queue } from 'bullmq';
import { sendWhatsAppAuto, sendWhatsAppMediaDetailed, sendWhatsAppTemplate, normalizePhone } from '../services/whatsapp.service';
import { resolveTemplateMessage } from './whatsappTemplates';
import redisClient from './redis';

export const connectionOptions = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null
};

// Create a Queue for Background Jobs (Producers only)
export const backupQueue = new Queue('backupQueue', { connection: connectionOptions });

// Create a Queue for Asynchronous Notifications (Producers only)
export const notificationQueue = new Queue('notificationQueue', { connection: connectionOptions });

// Create a Queue for Asset Optimization Jobs (Producers only)
export const assetOptimizationQueue = new Queue('assetOptimizationQueue', { connection: connectionOptions });

/**
 * Retry policy for notification jobs.
 *
 * These jobs previously used BullMQ's default of a single attempt, so one
 * transient Graph API blip permanently dropped a parent's fee reminder or a
 * password-reset OTP (87 such jobs are sitting in the failed set from a single
 * outage on 2026-08-06).
 *
 * The 2-minute base backoff is deliberate and must stay above
 * WHATSAPP_DEDUPE_WINDOW_MS (default 60s): whatsapp.service suppresses an
 * identical send inside that window and reports success, so a faster retry
 * would be swallowed as a duplicate and the job would "succeed" without ever
 * delivering anything.
 */
export const NOTIFICATION_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 120000 }
};

/**
 * Utility helper to queue asset optimization.
 * Falls back to synchronous execution if Redis client is not connected.
 */
export const queueAssetOptimization = async (data: {
  assetType: 'photo' | 'signature' | 'logo';
  s3Key: string;
  modelType: 'student' | 'teacher' | 'schoolProfile';
  modelId: string;
  docId?: string;
}) => {
  const redisClient = require('./redis').default;
  if (redisClient && redisClient.status === 'ready') {
    await assetOptimizationQueue.add('optimizeAsset', data);
    console.log(`[Queue] Asset optimization job enqueued for key: ${data.s3Key}`);
  } else {
    console.warn(`[Queue] Redis not ready. Processing asset optimization synchronously for key: ${data.s3Key}`);
    const { optimizeAssetSync } = require('../services/assetOptimization.service');
    optimizeAssetSync(data).catch((err: any) => {
      console.error(`[Queue] Synchronous asset optimization failed:`, err);
    });
  }
};

/**
 * Utility helper to queue notifications.
 * Falls back to synchronous execution if Redis client is not connected.
 */
export const queueNotification = async (jobName: 'sendWhatsAppText' | 'sendWhatsAppMedia', data: any) => {
  const redisClient = require('./redis').default;
  if (redisClient && redisClient.status === 'ready') {
    await notificationQueue.add(jobName, data, NOTIFICATION_JOB_OPTIONS);
    console.log(`[Queue] Notification "${jobName}" enqueued successfully.`);
  } else {
    console.warn(`[Queue] Redis not ready. Falling back to synchronous execution for "${jobName}".`);
    if (jobName === 'sendWhatsAppText') {
      await sendWhatsAppAuto(data.to, data.text);
    } else if (jobName === 'sendWhatsAppMedia') {
      await sendWhatsAppMediaDetailed(data.to, data.mediaUrl, data.type, data.filename, data.caption);
    }
  }
};

export type TemplateNotificationResult = { queued: boolean; reason?: string };

/**
 * Validate + enqueue a Meta template notification for PROACTIVE
 * (business-initiated) messaging — e.g. attendance-absence alerts.
 *
 * Runs the SAME infrastructure as queueNotification:
 *  - same `notificationQueue`, same NOTIFICATION_JOB_OPTIONS (3 attempts, 2-min
 *    exponential backoff kept above WHATSAPP_DEDUPE_WINDOW_MS)
 *  - same synchronous fallback when Redis is down
 *  - the worker records the send through the existing WhatsAppMessage lifecycle
 *    (queued → sending → sent → delivered → read / failed) and dedupe.
 *
 * Validation happens HERE (registry key known, params complete, no stray params,
 * recipient phone valid) so a malformed template job never reaches Meta.
 */
export const queueTemplateNotification = async (
  templateKey: string,
  data: { to: string; params: Record<string, unknown>; dedupeKey?: string }
): Promise<TemplateNotificationResult> => {
  const resolved = resolveTemplateMessage(templateKey, data.params || {});
  if (!resolved.ok) {
    console.error(`[Queue] Template notification rejected — ${resolved.error}`);
    return { queued: false, reason: resolved.error };
  }

  const phone = normalizePhone(data.to);
  if (!phone.ok) {
    console.error(
      `[Queue] Template notification "${resolved.message.metaName}" rejected — invalid recipient (${phone.reason}).`
    );
    return { queued: false, reason: `invalid recipient: ${phone.reason}` };
  }

  const jobData = {
    to: data.to,
    templateKey,
    templateName: resolved.message.metaName,
    languageCode: resolved.message.language,
    named: resolved.message.named,
    dedupeKey: data.dedupeKey
  };

  if (redisClient && redisClient.status === 'ready') {
    await notificationQueue.add('sendWhatsAppTemplate', jobData, NOTIFICATION_JOB_OPTIONS);
    console.log(
      `[Queue] Template notification "${jobData.templateName}" (${templateKey}) enqueued successfully.`
    );
  } else {
    console.warn(
      `[Queue] Redis not ready. Sending template "${jobData.templateName}" synchronously.`
    );
    await sendWhatsAppTemplate(jobData.to, jobData.templateName, jobData.languageCode, jobData.named, {
      dedupeKey: jobData.dedupeKey
    });
  }
  return { queued: true };
};

console.log('[BullMQ] Queues initialized.');
