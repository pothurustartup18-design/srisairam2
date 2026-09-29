/**
 * WhatsApp Cloud API service — the ONLY module that talks to graph.facebook.com
 * for message sending.
 *
 * Production guarantees:
 *  - Credentials come exclusively from src/config/whatsapp.ts (env-backed, validated at startup).
 *  - Every recipient is normalized/validated to E.164 before dispatch.
 *  - Transient failures (network, HTTP 429/5xx, Meta transient codes) retry with
 *    exponential backoff + jitter; permanent failures (bad number, bad template,
 *    auth) never retry.
 *  - Accidental double-sends are suppressed (content-hash window + optional
 *    caller-supplied dedupeKey backed by a unique index).
 *  - Every send is recorded in WhatsAppMessage with the full status lifecycle
 *    (queued → sending → sent → delivered → read / failed) — webhook updates
 *    delivered/read.
 *  - No function here ever throws; failures are returned, logged, and recorded.
 *  - Secrets are never logged.
 *
 * Backward-compatible exports: formatPhoneNumber, sendWhatsAppText,
 * sendWhatsAppMedia, sendWhatsAppAuto (same signatures, still return boolean).
 */

import crypto from 'crypto';
import { WhatsAppMessage, IWhatsAppMessage } from '../models/whatsappMessage.model';
import { SystemConfig } from '../models/systemConfig.model';
import { extractS3Key, getPresignedDownloadUrl, WHATSAPP_MEDIA_SIZE_LIMITS } from './s3.service';
import { uploadGallery } from './mediaGallery.service';
import { resolveTenantConfig, DEFAULT_SCHOOL_ID, WhatsAppTenantConfig } from '../config/whatsapp';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Media for a template's HEADER component (templates whose header format is
 * DOCUMENT / IMAGE / VIDEO — e.g. fee_receipt, report_card_notice).
 * `link` must be a publicly fetchable URL (a presigned S3 URL is fine).
 */
export interface TemplateHeaderMedia {
  type: 'document' | 'image' | 'video';
  link: string;
  /** Filename shown to the recipient — documents only. */
  filename?: string;
}

export interface SendOptions {
  schoolId?: string;
  /** Caller-supplied idempotency key. Two calls with the same key send at most one message. */
  dedupeKey?: string;
  bypassQuota?: boolean;
  /** HEADER media for a template send (ignored by non-template sends). */
  templateHeader?: TemplateHeaderMedia;
  /**
   * Set for AUTHENTICATION templates with a "Copy code" button (e.g. `o_auth`).
   * Appends a BUTTON component (sub_type "url", parameter type "text") carrying
   * this same value, as Meta's Cloud API requires alongside the BODY parameter.
   * NOT sub_type "copy_code"/"coupon_code" — that pair is for a different
   * feature (Limited-Time-Offer MARKETING templates' coupon button) and
   * produces Meta error 132018 ("issue with the parameters") if used here.
   */
  otpButtonCode?: string;
}

export interface WhatsAppSendResult {
  success: boolean;
  wamid?: string;
  deduped?: boolean;
  simulated?: boolean;
  usedFallbackTemplate?: boolean;
  error?: ClassifiedError;
}

export interface ClassifiedError {
  retryable: boolean;
  httpStatus?: number;
  code?: number;
  subcode?: number;
  title?: string;
  message?: string;
  reason: string;
}

type MessageType = IWhatsAppMessage['messageType'];

// ─── Structured logging (never includes tokens/secrets) ─────────────────────

function logWa(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), event, ...fields });
  if (level === 'error') console.error('[WhatsApp]', line);
  else if (level === 'warn') console.warn('[WhatsApp]', line);
  else console.log('[WhatsApp]', line);
}

// ─── Phone normalization (E.164) ─────────────────────────────────────────────

export interface PhoneNormalizationResult {
  ok: boolean;
  /** E.164 digits without '+', as the Cloud API expects. */
  e164?: string;
  reason?: string;
}

/**
 * Normalize any human-entered phone into E.164 digits (no '+').
 * Rules: strip non-digits and the international "00" prefix; strip a single
 * Indian trunk '0' before a 10-digit local number; prepend the default country
 * code (91 unless overridden) to bare 10-digit numbers; enforce E.164 length.
 */
export function normalizePhone(raw: string, defaultCountryCode = '91'): PhoneNormalizationResult {
  if (!raw || typeof raw !== 'string') {
    return { ok: false, reason: 'empty phone number' };
  }
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = `${defaultCountryCode}${digits}`;

  if (digits.length < 10 || digits.length > 15) {
    return { ok: false, reason: `invalid length ${digits.length} after normalization (E.164 allows 10-15 digits)` };
  }
  if (digits.startsWith('0')) {
    return { ok: false, reason: 'number cannot start with 0 after country code normalization' };
  }
  return { ok: true, e164: digits };
}

/**
 * Backward-compatible helper (kept for existing callers/tests). Prefer
 * normalizePhone() which also reports invalid numbers.
 */
export function formatPhoneNumber(phone: string): string {
  const result = normalizePhone(phone);
  return result.e164 || phone.replace(/\D/g, '');
}

// ─── Meta error classification ───────────────────────────────────────────────

/** Meta error codes that are transient and safe to retry with backoff. */
const RETRYABLE_META_CODES = new Set<number>([
  1, // API Unknown — possibly transient
  2, // API Service — temporarily unavailable
  4, // API Too Many Calls (app-level throttling)
  17, // User request limit reached
  32, // Page request limit reached
  80007, // WABA rate limit
  130429, // Cloud API rate limit hit
  131016, // Service overloaded
  131056 // Pair rate limit (too many messages to the same recipient quickly)
]);

/** Meta's "24-hour session window closed" — handled via approved template fallback, never retried. */
export const REENGAGEMENT_ERROR_CODE = 131047;

const PERMANENT_CODE_HINTS: Record<number, string> = {
  0: 'Authentication failed — the access token is invalid',
  3: 'App capability/permission missing — check System User token scopes (whatsapp_business_messaging)',
  10: 'Permission denied — the System User lacks access to this WhatsApp asset',
  100: 'Invalid parameter — often a malformed payload or invalid recipient phone number',
  190: 'Access token expired or invalidated — generate a new System User token in Meta Business Settings',
  368: 'Business temporarily blocked for policy violations',
  131005: 'Access denied — missing permissions for this operation',
  131008: 'Required parameter is missing from the request',
  131009: 'A parameter value is not valid',
  131021: 'Recipient is the same as the sender number',
  131026: 'Message undeliverable — recipient may not have WhatsApp or has not accepted the latest terms',
  131031: 'WhatsApp Business Account has been locked or restricted',
  131047: 'Re-engagement required — more than 24h since the user last messaged (template required)',
  131049: 'Message not delivered to maintain healthy ecosystem engagement (marketing limit)',
  131051: 'Unsupported message type',
  131052: 'Media download error on Meta side — check the media URL is publicly reachable',
  131053: 'Media upload error',
  132000: 'Template parameter count mismatch',
  132001: 'Template does not exist or is not approved in this language',
  132005: 'Template hydrated text too long',
  132007: 'Template content violates WhatsApp policy',
  132012: 'Template parameter format mismatch',
  132015: 'Template is paused due to low quality',
  132016: 'Template is disabled',
  133010: 'Phone number is not registered on the WhatsApp Cloud API'
};

/**
 * Decide whether a failed request may be retried.
 * Retry: network errors, HTTP 429, HTTP 5xx, known transient Meta codes, or
 * responses Meta itself flags as transient. Everything else is permanent.
 */
export function classifySendError(httpStatus: number | undefined, body: any, networkError?: Error): ClassifiedError {
  if (networkError) {
    return {
      retryable: true,
      reason: `network error: ${networkError.message}`,
      message: networkError.message
    };
  }

  const err = body?.error;
  const code: number | undefined = typeof err?.code === 'number' ? err.code : undefined;
  const subcode: number | undefined = typeof err?.error_subcode === 'number' ? err.error_subcode : undefined;
  const base = {
    httpStatus,
    code,
    subcode,
    title: err?.error_user_title || err?.type,
    message: err?.error_user_msg || err?.message
  };

  if (code !== undefined && RETRYABLE_META_CODES.has(code)) {
    return { ...base, retryable: true, reason: `transient Meta error code ${code}` };
  }
  if (err?.is_transient === true) {
    return { ...base, retryable: true, reason: 'Meta flagged error as transient' };
  }
  if (code !== undefined && PERMANENT_CODE_HINTS[code]) {
    return { ...base, retryable: false, reason: PERMANENT_CODE_HINTS[code] };
  }
  if (httpStatus === 429) {
    return { ...base, retryable: true, reason: 'HTTP 429 rate limited' };
  }
  if (httpStatus !== undefined && httpStatus >= 500) {
    return { ...base, retryable: true, reason: `HTTP ${httpStatus} Meta server error` };
  }
  return { ...base, retryable: false, reason: `permanent failure (HTTP ${httpStatus}, Meta code ${code ?? 'n/a'})` };
}

/** Exponential backoff with full jitter, capped at 30s. Honors Retry-After when longer. */
export function computeBackoffMs(attempt: number, retryAfterSeconds?: number): number {
  const exp = Math.min(1000 * Math.pow(2, attempt), 30000);
  const jittered = exp / 2 + Math.random() * (exp / 2);
  if (retryAfterSeconds && retryAfterSeconds > 0) {
    return Math.min(Math.max(retryAfterSeconds * 1000, jittered), 60000);
  }
  return jittered;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Duplicate-send suppression ───────────────────────────────────────────────

// In-memory content-hash window (works with or without MongoDB). Suppresses the
// classic "endpoint called twice" double send without blocking intentional
// repeats later on.
const recentSends = new Map<string, number>();

function computeContentHash(to: string, type: string, payload: unknown): string {
  return crypto.createHash('sha256').update(`${to}|${type}|${JSON.stringify(payload)}`).digest('hex');
}

function isRecentDuplicate(contentHash: string, windowMs: number): boolean {
  if (windowMs <= 0) return false;
  const now = Date.now();
  // opportunistic cleanup so the map cannot grow unbounded
  if (recentSends.size > 5000) {
    for (const [key, ts] of recentSends) {
      if (now - ts > windowMs) recentSends.delete(key);
    }
  }
  const previous = recentSends.get(contentHash);
  if (previous !== undefined && now - previous < windowMs) return true;
  recentSends.set(contentHash, now);
  return false;
}

/** Test hook. */
export function _clearDedupeWindow(): void {
  recentSends.clear();
}

// ─── DB persistence (never allowed to break the send path) ──────────────────

async function safeCreateRecord(fields: Partial<IWhatsAppMessage>): Promise<IWhatsAppMessage | null> {
  try {
    return await WhatsAppMessage.create({
      ...fields,
      statusHistory: [{ status: fields.status || 'queued', at: new Date(), source: 'api' }]
    });
  } catch (err: any) {
    // E11000 duplicate dedupeKey — a concurrent call already created this message
    if (err?.code === 11000) return null;
    logWa('warn', 'db_record_create_failed', { error: err?.message });
    return null;
  }
}

async function safeUpdateRecord(record: IWhatsAppMessage | null, update: () => void): Promise<void> {
  if (!record) return;
  try {
    update();
    await record.save();
  } catch (err: any) {
    logWa('warn', 'db_record_update_failed', { error: err?.message });
  }
}

// ─── Core dispatcher ──────────────────────────────────────────────────────────

interface DispatchArgs {
  to: string; // raw, pre-normalization
  messageType: MessageType;
  /** Body of the Graph API request minus messaging_product/recipient fields. */
  payloadFields: Record<string, unknown>;
  bodyPreview: string;
  templateName?: string;
  options?: SendOptions;
  /** Internal guard so a template fallback can never recurse into another fallback. */
  _isFallback?: boolean;
  /** Original text — used to build the re-engagement fallback template. */
  _fallbackText?: string;
}

async function getWhatsappQuota(): Promise<{ count: number; limit: number }> {
  let limit = 100;
  let count = 0;
  try {
    const limitConfig = await SystemConfig.findOne({ key: 'whatsappLimit' });
    const countConfig = await SystemConfig.findOne({ key: 'whatsappSentCount' });
    limit = limitConfig ? Number(limitConfig.value) : 100;
    count = countConfig ? Number(countConfig.value) : 0;
  } catch (err: any) {
    logWa('warn', 'failed_to_fetch_quota', { error: err?.message });
  }
  return { count, limit };
}

async function incrementWhatsappSentCount(): Promise<void> {
  try {
    await SystemConfig.findOneAndUpdate(
      { key: 'whatsappSentCount' },
      { $inc: { value: 1 } },
      { upsert: true }
    );
  } catch (err: any) {
    logWa('warn', 'failed_to_increment_counter', { error: err?.message });
  }
}

async function dispatch(args: DispatchArgs): Promise<WhatsAppSendResult> {
  const schoolId = args.options?.schoolId || DEFAULT_SCHOOL_ID;

  // Check WhatsApp message limit before sending (unless bypassed, e.g., for follow-up message splits)
  if (!args.options?.bypassQuota) {
    const { count, limit } = await getWhatsappQuota();
    if (count >= limit) {
      logWa('warn', 'limit_exceeded', { schoolId, count, limit });
      return {
        success: false,
        error: {
          retryable: false,
          reason: `WhatsApp messaging quota exceeded (${count}/${limit} sent)`
        }
      };
    }
  }

  const config = resolveTenantConfig(schoolId);

  // Simulation mode: no WhatsApp env configured (local development).
  if (!config) {
    logWa('info', 'simulated_send', {
      schoolId,
      to: args.to,
      messageType: args.messageType,
      preview: args.bodyPreview.slice(0, 120)
    });
    await incrementWhatsappSentCount();
    return { success: true, simulated: true };
  }

  const normalized = normalizePhone(args.to, config.defaultCountryCode);
  if (!normalized.ok) {
    logWa('error', 'invalid_recipient', { schoolId, to: args.to, reason: normalized.reason });
    await safeCreateRecord({
      schoolId,
      to: args.to.replace(/\D/g, '') || 'invalid',
      messageType: args.messageType,
      bodyPreview: args.bodyPreview.slice(0, 500),
      templateName: args.templateName,
      status: 'failed',
      contentHash: computeContentHash(args.to, args.messageType, args.payloadFields),
      attempts: 0,
      error: { message: `invalid phone number: ${normalized.reason}`, retryable: false }
    });
    return {
      success: false,
      error: { retryable: false, reason: `invalid phone number: ${normalized.reason}` }
    };
  }
  const to = normalized.e164!;

  const contentHash = computeContentHash(to, args.messageType, args.payloadFields);

  // 1) Accidental duplicate (same content, same recipient, short window)
  if (isRecentDuplicate(contentHash, config.dedupeWindowMs)) {
    logWa('warn', 'duplicate_suppressed', { schoolId, to, messageType: args.messageType, window_ms: config.dedupeWindowMs });
    return { success: true, deduped: true };
  }

  // 2) Explicit idempotency key (survives restarts via unique index)
  if (args.options?.dedupeKey) {
    try {
      const existing = await WhatsAppMessage.findOne({ dedupeKey: args.options.dedupeKey });
      if (existing && existing.status !== 'failed') {
        logWa('warn', 'dedupe_key_hit', { schoolId, to, dedupeKey: args.options.dedupeKey, existingStatus: existing.status });
        return { success: true, deduped: true, wamid: existing.wamid };
      }
    } catch (err: any) {
      logWa('warn', 'dedupe_lookup_failed', { error: err?.message });
    }
  }

  const record = await safeCreateRecord({
    schoolId,
    to,
    messageType: args.messageType,
    bodyPreview: args.bodyPreview.slice(0, 500),
    templateName: args.templateName,
    status: 'queued',
    dedupeKey: args.options?.dedupeKey,
    contentHash,
    attempts: 0
  });

  const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;
  const requestBody = JSON.stringify({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    ...args.payloadFields
  });

  let lastError: ClassifiedError | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    await safeUpdateRecord(record, () => {
      record!.status = record!.status === 'queued' ? 'sending' : record!.status;
      record!.attempts = attempt + 1;
      if (attempt === 0) record!.statusHistory.push({ status: 'sending', at: new Date(), source: 'api' });
    });

    let response: Response | undefined;
    let body: any;
    let networkError: Error | undefined;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.httpTimeoutMs);
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: requestBody,
        signal: controller.signal
      });
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }
    } catch (err: any) {
      networkError = err instanceof Error ? err : new Error(String(err));
      if (networkError.name === 'AbortError') {
        networkError = new Error(`request timed out after ${config.httpTimeoutMs}ms`);
      }
    } finally {
      clearTimeout(timer);
    }

    // Success
    if (response?.ok && body?.messages?.[0]?.id) {
      const wamid: string = body.messages[0].id;
      logWa('info', 'message_sent', {
        schoolId,
        to,
        messageType: args.messageType,
        templateName: args.templateName,
        httpStatus: response.status,
        wamid,
        attempt: attempt + 1
      });
      await safeUpdateRecord(record, () => {
        record!.status = 'sent';
        record!.wamid = wamid;
        record!.statusHistory.push({ status: 'sent', at: new Date(), source: 'api' });
      });
      await incrementWhatsappSentCount();
      return { success: true, wamid };
    }

    const classified = classifySendError(response?.status, body, networkError);
    lastError = classified;

    // 24h window closed → resend as approved fallback template (once, never
    // recursive). Only when explicitly enabled AND the send is not itself the
    // fallback: the default fallback template (school_notification) is PENDING,
    // so without an APPROVED one this would only produce a second failure.
    if (classified.code === REENGAGEMENT_ERROR_CODE && !args._isFallback && config.fallbackEnabled) {
      logWa('warn', 'session_window_closed', { schoolId, to, messageType: args.messageType });
      await safeUpdateRecord(record, () => {
        record!.status = 'failed';
        record!.error = toRecordError(classified);
        record!.statusHistory.push({ status: 'failed', at: new Date(), source: 'api' });
      });
      const fallbackText =
        args._fallbackText ?? (typeof (args.payloadFields as any)?.text?.body === 'string' ? (args.payloadFields as any).text.body : args.bodyPreview);
      const fallbackResult = await sendWhatsAppTemplate(
        to,
        config.fallbackTemplateName,
        config.fallbackTemplateLang,
        [fallbackText.slice(0, 1024)],
        { ...args.options },
        true
      );
      return { ...fallbackResult, usedFallbackTemplate: true };
    }

    logWa(classified.retryable ? 'warn' : 'error', 'send_failed', {
      schoolId,
      to,
      messageType: args.messageType,
      templateName: args.templateName,
      httpStatus: response?.status,
      metaCode: classified.code,
      metaSubcode: classified.subcode,
      reason: classified.reason,
      metaMessage: classified.message,
      attempt: attempt + 1,
      willRetry: classified.retryable && attempt < config.maxRetries
    });

    if (!classified.retryable || attempt >= config.maxRetries) break;

    const retryAfterHeader = response?.headers?.get?.('retry-after');
    const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
    await sleep(computeBackoffMs(attempt, Number.isNaN(retryAfterSeconds) ? undefined : retryAfterSeconds));
  }

  await safeUpdateRecord(record, () => {
    record!.status = 'failed';
    record!.error = toRecordError(lastError);
    record!.statusHistory.push({ status: 'failed', at: new Date(), source: 'api' });
  });
  return { success: false, error: lastError };
}

function toRecordError(err?: ClassifiedError) {
  if (!err) return undefined;
  return {
    code: err.code,
    subcode: err.subcode,
    httpStatus: err.httpStatus,
    title: err.title,
    message: err.message || err.reason,
    retryable: err.retryable
  };
}

// ─── Public send functions ────────────────────────────────────────────────────

/** Send a free-form text message. Returns full result details. */
export async function sendWhatsAppTextDetailed(to: string, text: string, options?: SendOptions): Promise<WhatsAppSendResult> {
  try {
    return await dispatch({
      to,
      messageType: 'text',
      payloadFields: { type: 'text', text: { preview_url: true, body: text } },
      bodyPreview: text,
      options,
      _fallbackText: text
    });
  } catch (err: any) {
    logWa('error', 'unexpected_exception', { fn: 'sendWhatsAppText', error: err?.message });
    return { success: false, error: { retryable: false, reason: `unexpected exception: ${err?.message}` } };
  }
}

/** Backward-compatible boolean API used across routes/scheduler. */
export async function sendWhatsAppText(to: string, text: string, options?: SendOptions): Promise<boolean> {
  return (await sendWhatsAppTextDetailed(to, text, options)).success;
}

/**
 * Body parameters for a template send.
 *  - `string[]`               → POSITIONAL params ({{1}}, {{2}}, …). Unchanged
 *                               legacy behavior (used by the 24h re-engagement
 *                               fallback and staff-credential templates).
 *  - `Record<string,string>`  → NAMED params ({{student_name_en}}, …). Each
 *                               parameter object carries a `parameter_name`, as
 *                               required by the Cloud API when the approved
 *                               template's parameter_format is NAMED (v23.0).
 *
 * Named and positional are never mixed — a template is one or the other.
 */
export type TemplateBodyParameters = string[] | Record<string, string>;

/**
 * Build the `components` array for a template payload.
 * Returns undefined when there are no body parameters (e.g. a static template).
 */
export function buildTemplateComponents(
  bodyParameters: TemplateBodyParameters
): Array<Record<string, unknown>> | undefined {
  if (Array.isArray(bodyParameters)) {
    if (bodyParameters.length === 0) return undefined;
    return [
      {
        type: 'body',
        parameters: bodyParameters.map((text) => ({ type: 'text', text: String(text) }))
      }
    ];
  }

  const entries = Object.entries(bodyParameters || {});
  if (entries.length === 0) return undefined;
  return [
    {
      type: 'body',
      parameters: entries.map(([parameterName, text]) => ({
        type: 'text',
        parameter_name: parameterName,
        text: String(text)
      }))
    }
  ];
}

/**
 * Build the HEADER component for a template with a media header
 * (DOCUMENT / IMAGE / VIDEO). The Cloud API shape is:
 *   { type: 'header', parameters: [ { type: 'document', document: { link, filename } } ] }
 */
export function buildTemplateHeaderComponent(header: TemplateHeaderMedia): Record<string, unknown> {
  const media: Record<string, unknown> = { link: header.link };
  if (header.type === 'document' && header.filename) media.filename = header.filename;
  return { type: 'header', parameters: [{ type: header.type, [header.type]: media }] };
}

/** Send an approved template message (positional OR named body params, optional media header). */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  bodyParameters: TemplateBodyParameters = [],
  options?: SendOptions,
  _isFallback = false
): Promise<WhatsAppSendResult> {
  try {
    const bodyComponents = buildTemplateComponents(bodyParameters) || [];
    const headerComponents = options?.templateHeader
      ? [buildTemplateHeaderComponent(options.templateHeader)]
      : [];
    // Meta's AUTHENTICATION "Copy Code" button is, under the Cloud API, a
    // `url`-subtype button carrying the code as a plain `text` parameter — NOT
    // `sub_type: 'copy_code'` / `coupon_code` (that pair is for Limited-Time-Offer
    // MARKETING templates' coupon button, a different feature entirely). Using
    // the marketing shape here produced Meta error 132018 ("issue with the
    // parameters") on every send — confirmed live against the o_auth template.
    const buttonComponents = options?.otpButtonCode
      ? [
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: options.otpButtonCode }]
          }
        ]
      : [];
    const components = [...headerComponents, ...bodyComponents, ...buttonComponents];
    const previewParts = Array.isArray(bodyParameters)
      ? [...bodyParameters]
      : Object.entries(bodyParameters || {}).map(([k, v]) => `${k}=${v}`);
    if (options?.templateHeader) previewParts.unshift(`[${options.templateHeader.type} header]`);
    if (options?.otpButtonCode) previewParts.push('[copy-code button]');
    return await dispatch({
      to,
      messageType: 'template',
      payloadFields: {
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          ...(components.length ? { components } : {})
        }
      },
      bodyPreview: `[template:${templateName}] ${previewParts.join(' | ')}`,
      templateName,
      options,
      _isFallback
    });
  } catch (err: any) {
    logWa('error', 'unexpected_exception', { fn: 'sendWhatsAppTemplate', error: err?.message });
    return { success: false, error: { retryable: false, reason: `unexpected exception: ${err?.message}` } };
  }
}

/** Send an image/document/video/audio message by public URL. */
export async function sendWhatsAppMediaDetailed(
  to: string,
  mediaUrl: string,
  type: 'image' | 'document' | 'video' | 'audio',
  filename?: string,
  caption?: string,
  options?: SendOptions
): Promise<WhatsAppSendResult> {
  try {
    let finalType: 'image' | 'document' | 'video' | 'audio' = type;
    let finalFilename = filename;

    // Meta Graph API does not accept WebP as an image — deliver as document instead.
    const lowered = mediaUrl.toLowerCase();
    if (type === 'image' && (lowered.includes('.webp') || lowered.includes('image/webp'))) {
      finalType = 'document';
      finalFilename = filename || 'announcement.webp';
    }

    const mediaObject: Record<string, unknown> = { link: mediaUrl };
    if (caption && finalType !== 'audio') mediaObject.caption = caption;
    if (finalType === 'document' && finalFilename) mediaObject.filename = finalFilename;

    const result = await dispatch({
      to,
      messageType: finalType,
      payloadFields: { type: finalType, [finalType]: mediaObject },
      bodyPreview: `[${finalType}] ${mediaUrl}${caption ? ` | ${caption}` : ''}`,
      options,
      _fallbackText: `${caption ? caption + '\n\n' : ''}📎 View attachment: ${mediaUrl}`
    });

    // Audio files on Meta WhatsApp API do not support the caption parameter.
    // If a caption is present, we send it as a follow-up text message.
    if (result.success && finalType === 'audio' && caption && caption.trim()) {
      await sendWhatsAppTextDetailed(to, caption, {
        ...options,
        bypassQuota: true // bypass quota since they are part of a single user-initiated action
      });
    }

    return result;
  } catch (err: any) {
    logWa('error', 'unexpected_exception', { fn: 'sendWhatsAppMedia', error: err?.message });
    return { success: false, error: { retryable: false, reason: `unexpected exception: ${err?.message}` } };
  }
}

/** Backward-compatible boolean API. */
export async function sendWhatsAppMedia(
  to: string,
  mediaUrl: string,
  type: 'image' | 'document' | 'video' | 'audio',
  filename?: string,
  caption?: string,
  options?: SendOptions
): Promise<boolean> {
  return (await sendWhatsAppMediaDetailed(to, mediaUrl, type, filename, caption, options)).success;
}

export interface OutgoingAttachment {
  url: string;
  type: 'image' | 'document' | 'video' | 'audio';
  filename?: string;
  /** Actual stored byte size, when known — used to decide native-send vs gallery-bundle. */
  size?: number;
}

export type ResolvedWhatsAppDelivery =
  | { mode: 'text'; text: string }
  | { mode: 'native'; text: string; item: OutgoingAttachment }
  | { mode: 'gallery'; text: string };

/**
 * Decides how text + N attachments should actually go out on WhatsApp:
 *  - no attachments → plain text.
 *  - exactly one attachment within Meta's size cap for its type → native media
 *    message with the text as its caption (unchanged single-attachment behavior).
 *  - otherwise (2+ attachments, or a single attachment over its type's cap,
 *    e.g. a 100MB video) → bundle everything into one gallery page and send a
 *    single text message linking to it, since Meta only allows one media item
 *    per message and enforces hard per-type size caps regardless of storage.
 *
 * Callers broadcasting to many recipients must call this ONCE and reuse the
 * result via dispatchResolvedDelivery per recipient — otherwise a shared
 * gallery would get re-uploaded to S3 once per recipient.
 */
export async function resolveWhatsAppDelivery(
  text: string,
  attachments: OutgoingAttachment[]
): Promise<ResolvedWhatsAppDelivery> {
  if (attachments.length === 0) {
    return { mode: 'text', text };
  }

  if (attachments.length === 1) {
    const item = attachments[0];
    const limit = WHATSAPP_MEDIA_SIZE_LIMITS[item.type];
    if (item.size === undefined || item.size <= limit) {
      return { mode: 'native', text, item };
    }
  }

  const galleryUrl = await uploadGallery(attachments.map(a => ({ url: a.url, type: a.type, filename: a.filename })));
  const linkedText = `${text ? text + '\n\n' : ''}📎 View attachment(s): ${galleryUrl}`;
  return { mode: 'gallery', text: linkedText };
}

/**
 * Parses a request body's attachment fields into an OutgoingAttachment[],
 * preferring the new `media` array over the legacy single `mediaUrl` field.
 */
export function normalizeAttachments(body: any): OutgoingAttachment[] {
  if (Array.isArray(body.media) && body.media.length > 0) {
    return body.media
      .filter((m: any) => m && typeof m.url === 'string' && m.url)
      .map((m: any) => ({ url: m.url, type: m.type || 'image', filename: m.filename, size: typeof m.size === 'number' ? m.size : undefined }));
  }
  if (body.mediaUrl) {
    return [{ url: body.mediaUrl, type: body.mediaType || 'image', filename: body.mediaFilename }];
  }
  return [];
}

/** Sends one already-resolved delivery (see resolveWhatsAppDelivery) to a single recipient. */
export async function dispatchResolvedDelivery(
  to: string,
  resolved: ResolvedWhatsAppDelivery,
  options?: SendOptions
): Promise<WhatsAppSendResult> {
  if (resolved.mode === 'native') {
    return sendWhatsAppMediaDetailed(to, resolved.item.url, resolved.item.type, resolved.item.filename, resolved.text, options);
  }
  return sendWhatsAppTextDetailed(to, resolved.text, options);
}

async function getPresignedUrlForRawUrl(rawUrl: string): Promise<string> {
  const s3Key = extractS3Key(rawUrl);
  if (!s3Key) return rawUrl;
  try {
    return await getPresignedDownloadUrl(s3Key);
  } catch (err: any) {
    logWa('warn', 'presign_failed', { error: err?.message });
    return rawUrl;
  }
}

/**
 * Inspects message text for media URLs (PDF/images) and dispatches as the
 * appropriate message type; falls back to plain text.
 */
export async function sendWhatsAppAuto(to: string, text: string, options?: SendOptions): Promise<boolean> {
  try {
    const match = text.match(/(https?:\/\/[^\s]+)/g);
    if (match) {
      const url = match[0];
      const lowered = url.toLowerCase();
      if (lowered.includes('.pdf') || lowered.includes('amazonaws.com/reports/')) {
        const presignedUrl = await getPresignedUrlForRawUrl(url);
        const updatedText = text.replace(url, presignedUrl);
        return sendWhatsAppMedia(to, presignedUrl, 'document', 'report_card.pdf', updatedText, options);
      }
      if (
        lowered.includes('.png') ||
        lowered.includes('.jpg') ||
        lowered.includes('.jpeg') ||
        lowered.includes('.webp') ||
        lowered.includes('images.unsplash.com')
      ) {
        const presignedUrl = await getPresignedUrlForRawUrl(url);
        const updatedText = text.replace(url, presignedUrl);
        return sendWhatsAppMedia(to, presignedUrl, 'image', undefined, updatedText, options);
      }
    }
    return sendWhatsAppText(to, text, options);
  } catch (err: any) {
    logWa('error', 'unexpected_exception', { fn: 'sendWhatsAppAuto', error: err?.message });
    return false;
  }
}
