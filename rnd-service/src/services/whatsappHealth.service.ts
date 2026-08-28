/**
 * WhatsApp health checks & startup self-test.
 *
 * - checkWhatsAppHealth(): live verification of token validity, Phone Number ID,
 *   WABA reachability, and webhook configuration. Used by GET /api/whatsapp/health.
 * - runWhatsAppStartupSelfTest(): called before the server starts listening.
 *   Definitive credential failures (invalid/expired token, wrong IDs, missing
 *   permissions) abort startup with a clear message; transient network problems
 *   only warn — a Meta outage must not keep the whole school ERP down.
 */

import { resolveTenantConfig, getWhatsAppMode } from '../config/whatsapp';
import { getWebhookStats } from './whatsappWebhook.processor';

interface CheckResult {
  ok: boolean;
  detail: string;
  metaCode?: number;
}

export interface TokenPermanenceInfo {
  type?: string;
  isPermanent: boolean;
  expiresAt: number | null;
  detail: string;
}

export interface WhatsAppHealthReport {
  mode: 'live' | 'simulation';
  overall: 'ok' | 'degraded' | 'error';
  checks: {
    configuration: CheckResult;
    tokenAndPhoneNumber?: CheckResult;
    businessAccount?: CheckResult;
    webhook: CheckResult;
  };
  phoneNumber?: {
    displayPhoneNumber?: string;
    verifiedName?: string;
    qualityRating?: string;
  };
  tokenInfo?: TokenPermanenceInfo;
  checkedAt: string;
}

async function graphGet(url: string, accessToken: string, timeoutMs = 10000): Promise<{ httpStatus?: number; body?: any; networkError?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal
    });
    let body: any;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    return { httpStatus: response.status, body };
  } catch (err: any) {
    return { networkError: err?.name === 'AbortError' ? `timed out after ${timeoutMs}ms` : err?.message || String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/** Meta codes that mean the credentials themselves are bad (fatal at startup). */
const FATAL_AUTH_CODES = new Set([0, 3, 10, 102, 190]);

/**
 * Determine whether the configured access token is a permanent (System User,
 * never-expiring) token or a short-lived one, via Meta's /debug_token endpoint.
 * Purely informational — never affects overall ok/degraded/error status.
 */
async function checkTokenPermanence(accessToken: string, apiVersion: string): Promise<TokenPermanenceInfo> {
  const result = await graphGet(
    `https://graph.facebook.com/${apiVersion}/debug_token?input_token=${accessToken}&access_token=${accessToken}`,
    accessToken
  );

  if (result.networkError) {
    return { isPermanent: false, expiresAt: null, detail: `Could not verify token type: ${result.networkError}` };
  }

  const data = result.body?.data;
  if (!data || result.httpStatus !== 200) {
    const msg = result.body?.error?.message;
    return { isPermanent: false, expiresAt: null, detail: msg ? `Meta rejected token inspection: ${msg}` : 'Meta did not return token metadata.' };
  }

  const expiresAt = typeof data.expires_at === 'number' ? data.expires_at : null;
  const isPermanent = expiresAt === 0;
  const type = data.type;

  let detail: string;
  if (isPermanent) {
    detail = `Permanent token — never expires (type: ${type || 'unknown'}).`;
  } else if (expiresAt) {
    detail = `Temporary token — expires ${new Date(expiresAt * 1000).toISOString()} (type: ${type || 'unknown'}). Replace with a permanent System User token before this expires.`;
  } else {
    detail = `Unable to determine expiry (type: ${type || 'unknown'}).`;
  }

  return { type, isPermanent, expiresAt, detail };
}

export async function checkWhatsAppHealth(): Promise<WhatsAppHealthReport> {
  const mode = getWhatsAppMode();
  const config = resolveTenantConfig();
  const { lastWebhookAt, lastStatusUpdateAt } = getWebhookStats();

  if (mode === 'simulation' || !config) {
    return {
      mode: 'simulation',
      overall: 'degraded',
      checks: {
        configuration: { ok: false, detail: 'Simulation mode — no WHATSAPP_* environment variables configured. Messages are logged, not sent.' },
        webhook: { ok: false, detail: 'Webhook inactive in simulation mode.' }
      },
      checkedAt: new Date().toISOString()
    };
  }

  const report: WhatsAppHealthReport = {
    mode: 'live',
    overall: 'ok',
    checks: {
      configuration: { ok: true, detail: `Configured (Phone Number ID ${config.phoneNumberId}, WABA ${config.businessAccountId}, API ${config.apiVersion}).` },
      webhook: { ok: true, detail: '' }
    },
    checkedAt: new Date().toISOString()
  };

  // Token + Phone Number ID in one call: this endpoint fails on a bad token AND on a wrong phone number id.
  const phoneCheck = await graphGet(
    `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
    config.accessToken
  );
  if (phoneCheck.networkError) {
    report.checks.tokenAndPhoneNumber = { ok: false, detail: `Could not reach Meta Graph API: ${phoneCheck.networkError}` };
  } else if (phoneCheck.httpStatus === 200) {
    report.checks.tokenAndPhoneNumber = { ok: true, detail: 'Access token valid; Phone Number ID resolves.' };
    report.phoneNumber = {
      displayPhoneNumber: phoneCheck.body?.display_phone_number,
      verifiedName: phoneCheck.body?.verified_name,
      qualityRating: phoneCheck.body?.quality_rating
    };
  } else {
    const code = phoneCheck.body?.error?.code;
    report.checks.tokenAndPhoneNumber = {
      ok: false,
      metaCode: code,
      detail: `Meta rejected the request (HTTP ${phoneCheck.httpStatus}, code ${code}): ${phoneCheck.body?.error?.message || 'unknown error'}`
    };
  }

  // WABA reachability (also confirms the token is scoped to the right business account)
  const wabaCheck = await graphGet(
    `https://graph.facebook.com/${config.apiVersion}/${config.businessAccountId}?fields=id,name`,
    config.accessToken
  );
  if (wabaCheck.networkError) {
    report.checks.businessAccount = { ok: false, detail: `Could not reach Meta Graph API: ${wabaCheck.networkError}` };
  } else if (wabaCheck.httpStatus === 200) {
    report.checks.businessAccount = { ok: true, detail: `WABA reachable${wabaCheck.body?.name ? ` ("${wabaCheck.body.name}")` : ''}.` };
  } else {
    const code = wabaCheck.body?.error?.code;
    report.checks.businessAccount = {
      ok: false,
      metaCode: code,
      detail: `WABA check failed (HTTP ${wabaCheck.httpStatus}, code ${code}): ${wabaCheck.body?.error?.message || 'unknown error'}`
    };
  }

  // Webhook configuration status
  const webhookParts: string[] = [];
  let webhookOk = true;
  if (config.webhookVerifyToken) {
    webhookParts.push('verify token configured');
  } else {
    webhookOk = false;
    webhookParts.push('VERIFY TOKEN MISSING (set WHATSAPP_WEBHOOK_VERIFY_TOKEN)');
  }
  if (config.appSecret) {
    webhookParts.push('signature verification enabled');
  } else {
    webhookOk = false;
    webhookParts.push('signature verification DISABLED (set WHATSAPP_APP_SECRET)');
  }
  webhookParts.push(lastWebhookAt ? `last webhook received ${lastWebhookAt.toISOString()}` : 'no webhook received since startup');
  if (lastStatusUpdateAt) webhookParts.push(`last status update ${lastStatusUpdateAt.toISOString()}`);
  report.checks.webhook = { ok: webhookOk, detail: webhookParts.join('; ') };

  const hardFailure = !report.checks.tokenAndPhoneNumber?.ok || !report.checks.businessAccount?.ok;
  report.overall = hardFailure ? 'error' : webhookOk ? 'ok' : 'degraded';

  // Informational only — never affects `overall`.
  report.tokenInfo = await checkTokenPermanence(config.accessToken, config.apiVersion);

  return report;
}

/**
 * Startup self-test. Throws only on DEFINITIVE credential/config failures so a
 * misconfigured deployment fails fast; warns (but allows startup) when Meta is
 * simply unreachable. Set WHATSAPP_STARTUP_MODE=warn to never abort startup.
 */
export async function runWhatsAppStartupSelfTest(): Promise<void> {
  if (getWhatsAppMode() === 'simulation') {
    console.warn('[WhatsApp Self-Test] Skipped — running in SIMULATION mode (no credentials configured).');
    return;
  }

  const report = await checkWhatsAppHealth();
  const tokenCheck = report.checks.tokenAndPhoneNumber;
  const wabaCheck = report.checks.businessAccount;

  if (tokenCheck?.ok) {
    console.log(
      `[WhatsApp Self-Test] PASSED — token valid, sending as ${report.phoneNumber?.displayPhoneNumber || 'unknown number'}` +
        `${report.phoneNumber?.verifiedName ? ` (${report.phoneNumber.verifiedName})` : ''}` +
        `${report.phoneNumber?.qualityRating ? `, quality: ${report.phoneNumber.qualityRating}` : ''}.`
    );
  }
  if (wabaCheck && !wabaCheck.ok) console.warn(`[WhatsApp Self-Test] WABA check: ${wabaCheck.detail}`);
  if (!report.checks.webhook.ok) console.warn(`[WhatsApp Self-Test] Webhook: ${report.checks.webhook.detail}`);

  const failures = [tokenCheck, wabaCheck].filter((c): c is CheckResult => !!c && !c.ok);
  if (failures.length === 0) return;

  const definitive = failures.filter((f) => f.metaCode !== undefined && FATAL_AUTH_CODES.has(f.metaCode));
  const details = failures.map((f) => `  - ${f.detail}`).join('\n');

  if (definitive.length > 0 && process.env.WHATSAPP_STARTUP_MODE !== 'warn') {
    throw new Error(
      `WhatsApp credentials rejected by Meta — refusing to start.\n${details}\n` +
        'Fix the System User token / IDs in .env (or set WHATSAPP_STARTUP_MODE=warn to boot anyway).'
    );
  }

  console.warn(`[WhatsApp Self-Test] Completed with warnings (startup continues):\n${details}`);
}
