import { Queue } from 'bullmq';
import { sendWhatsAppAuto, sendWhatsAppMediaDetailed } from '../services/whatsapp.service';

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

console.log('[BullMQ] Queues initialized.');
