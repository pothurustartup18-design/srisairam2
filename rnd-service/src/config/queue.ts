import { Queue } from 'bullmq';
import {
  sendWhatsAppAuto,
  sendWhatsAppMediaDetailed,
  sendWhatsAppTemplate,
  normalizePhone,
  TemplateHeaderMedia,
  WhatsAppSendResult
} from '../services/whatsapp.service';
import { resolveTemplateMessage, getRegisteredTemplate } from './whatsappTemplates';
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
 * @deprecated Free-form WhatsApp queue helper. No longer used for any ERP
 * notification — every PROACTIVE notification must go through
 * `queueTemplateNotification` (approved Meta template). Kept only so the worker
 * can still drain any legacy `sendWhatsAppText` / `sendWhatsAppMedia` jobs left
 * in Redis. Do NOT call this for new features.
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

export interface TemplateSendData {
  to: string;
  params: Record<string, unknown>;
  dedupeKey?: string;
  /** Required for templates whose registry entry declares a media `header`. */
  headerDocument?: { link: string; filename?: string };
}

export interface TemplateSendSyncOptions {
  /**
   * When true, a "successful" send that was actually SIMULATED (no WHATSAPP_*
   * env vars configured — see config/whatsapp.ts) is treated as a FAILURE if
   * NODE_ENV === 'production'. Without this, a misconfigured production deploy
   * (secrets not injected) would silently run in simulation mode and this
   * function would report "success" for a message that was never sent to
   * anyone — which is exactly backwards for a flow where WhatsApp delivery is
   * the ONLY channel a credential is ever handed out through (account
   * creation / password reset). Outside production (dev/test), simulation
   * mode still counts as success, same as everywhere else in the app, so
   * local development without real Meta credentials keeps working.
   */
  requireLiveSend?: boolean;
}

interface PreparedTemplateSend {
  to: string;
  templateName: string;
  languageCode: string;
  bodyParameters: string[] | Record<string, string>;
  otpButtonCode?: string;
  dedupeKey?: string;
  header?: TemplateHeaderMedia;
}

/**
 * Shared validation + payload-shaping for a Meta template send: resolves the
 * registry key, checks the media header requirement, normalizes the recipient
 * phone, and converts NAMED params to Meta's POSITIONAL array for AUTHENTICATION
 * templates (e.g. `o_auth`). Used by both the queued path (`queueTemplateNotification`)
 * and the synchronous path (`sendTemplateNotificationSync`) so the two never drift.
 */
function prepareTemplateSend(
  templateKey: string,
  data: TemplateSendData
): { ok: true; payload: PreparedTemplateSend } | { ok: false; reason: string } {
  const resolved = resolveTemplateMessage(templateKey, data.params || {});
  if (!resolved.ok) {
    return { ok: false, reason: resolved.error };
  }

  // Media header validation (headers are not body params, so checked here).
  const def = getRegisteredTemplate(templateKey);
  let header: TemplateHeaderMedia | undefined;
  if (def?.header) {
    if (!data.headerDocument?.link) {
      return { ok: false, reason: `template "${templateKey}" requires a ${def.header.type} header (headerDocument.link missing)` };
    }
    header = { type: def.header.type, link: data.headerDocument.link, filename: data.headerDocument.filename };
  }

  const phone = normalizePhone(data.to);
  if (!phone.ok) {
    return { ok: false, reason: `invalid recipient: ${phone.reason}` };
  }

  // AUTHENTICATION templates (e.g. o_auth) use Meta's POSITIONAL body format and
  // never NAMED parameters — convert the resolved named map into an ordered
  // array here, once, so every caller gets the same already-correct shape.
  const bodyParameters: string[] | Record<string, string> =
    resolved.message.parameterFormat === 'positional'
      ? def!.parameters.map((p) => resolved.message.named[p])
      : resolved.message.named;
  const otpButtonCode = resolved.message.otpButton ? (bodyParameters as string[])[0] : undefined;

  return {
    ok: true,
    payload: {
      to: data.to,
      templateName: resolved.message.metaName,
      languageCode: resolved.message.language,
      bodyParameters,
      otpButtonCode,
      dedupeKey: data.dedupeKey,
      header
    }
  };
}

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
 *
 * This only confirms the job was QUEUED (or, when Redis is down, dispatched
 * fire-and-forget) — it does NOT wait for Meta's actual response. Do not use
 * this for a flow where a database write must be conditioned on Meta actually
 * accepting the message (see `sendTemplateNotificationSync` below).
 */
export const queueTemplateNotification = async (
  templateKey: string,
  data: TemplateSendData
): Promise<TemplateNotificationResult> => {
  const prep = prepareTemplateSend(templateKey, data);
  if (!prep.ok) {
    console.error(`[Queue] Template notification rejected — ${prep.reason}`);
    return { queued: false, reason: prep.reason };
  }
  const { to, templateName, languageCode, bodyParameters, otpButtonCode, dedupeKey, header } = prep.payload;

  const jobData = { to, templateKey, templateName, languageCode, bodyParameters, otpButtonCode, dedupeKey, header };

  if (redisClient && redisClient.status === 'ready') {
    await notificationQueue.add('sendWhatsAppTemplate', jobData, NOTIFICATION_JOB_OPTIONS);
    console.log(
      `[Queue] Template notification "${jobData.templateName}" (${templateKey}) enqueued successfully.`
    );
  } else {
    console.warn(
      `[Queue] Redis not ready. Sending template "${jobData.templateName}" synchronously.`
    );
    await sendWhatsAppTemplate(jobData.to, jobData.templateName, jobData.languageCode, jobData.bodyParameters, {
      dedupeKey: jobData.dedupeKey,
      ...(header ? { templateHeader: header } : {}),
      ...(jobData.otpButtonCode ? { otpButtonCode: jobData.otpButtonCode } : {})
    });
  }
  return { queued: true };
};

export type TemplateSendSyncResult = { success: boolean; reason?: string; result?: WhatsAppSendResult };

/**
 * Send a Meta template notification SYNCHRONOUSLY — bypassing BullMQ/Redis
 * entirely, always, regardless of Redis status — and return the REAL Meta send
 * result (`sendWhatsAppTemplate` → `dispatch()`, including its existing in-process
 * retry/backoff for transient errors). Use this ONLY when a database write must
 * be conditioned on Meta actually having accepted the message — currently:
 * staff onboarding credentials (`staff.credentials_new`) and password-reset
 * credentials (`staff.credentials_reset`). Every other proactive notification
 * (attendance, fees, reports, announcements, transport, OTP) must keep using
 * `queueTemplateNotification` above — do not swap those to this function.
 *
 * A "success" here means the same thing `dispatch()` already means by it
 * everywhere else in the app: Meta accepted the request (incl. a deduped repeat
 * send, or simulation mode when no WHATSAPP_* env is configured) — never merely
 * "the job was created" or "Redis accepted it," because there is no job/queue
 * on this path at all.
 */
export const sendTemplateNotificationSync = async (
  templateKey: string,
  data: TemplateSendData,
  options?: TemplateSendSyncOptions
): Promise<TemplateSendSyncResult> => {
  const prep = prepareTemplateSend(templateKey, data);
  if (!prep.ok) {
    console.error(`[WhatsApp:sync] Template send rejected — ${prep.reason}`);
    return { success: false, reason: prep.reason };
  }
  const { to, templateName, languageCode, bodyParameters, otpButtonCode, dedupeKey, header } = prep.payload;

  const result = await sendWhatsAppTemplate(to, templateName, languageCode, bodyParameters, {
    dedupeKey,
    ...(header ? { templateHeader: header } : {}),
    ...(otpButtonCode ? { otpButtonCode } : {})
  });

  if (!result.success) {
    console.error(
      `[WhatsApp:sync] "${templateName}" (${templateKey}) not accepted by Meta: ${result.error?.reason || 'unknown error'}`
    );
    return { success: false, reason: result.error?.reason || 'WhatsApp send failed', result };
  }

  if (result.simulated && options?.requireLiveSend && process.env.NODE_ENV === 'production') {
    const reason =
      'refusing to treat a SIMULATED send as success in production — WHATSAPP_* env vars are not configured, ' +
      'so no message was actually sent to Meta. This almost certainly means the WhatsApp credentials were not ' +
      'injected into this deployment.';
    console.error(`[WhatsApp:sync] CRITICAL — "${templateName}" (${templateKey}) to ${to}: ${reason}`);
    return { success: false, reason, result };
  }

  return { success: true, result };
};

console.log('[BullMQ] Queues initialized.');
