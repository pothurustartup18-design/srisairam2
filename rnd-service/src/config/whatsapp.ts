/**
 * WhatsApp Cloud API configuration — single source of truth.
 *
 * All WhatsApp code MUST obtain credentials through this module. Nothing may read
 * process.env.WHATSAPP_* directly, and no token may ever be hardcoded.
 *
 * Modes:
 *  - 'live'       — all required env vars present and structurally valid.
 *  - 'simulation' — NO WhatsApp env vars set at all (local dev). Sends are logged, not dispatched.
 *
 * A PARTIAL configuration (some vars set, required ones missing/invalid) is a hard
 * startup error: the server refuses to boot rather than failing later mid-request.
 *
 * Multi-tenant note: resolveTenantConfig(schoolId) is the seam for future
 * per-school WhatsApp Business Accounts. Today every school resolves to the single
 * env-based account; later this can look up per-school credentials (DB/vault)
 * without touching any calling code.
 */

export interface WhatsAppTenantConfig {
  schoolId: string;
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  apiVersion: string;
  webhookVerifyToken?: string;
  appSecret?: string;
  fallbackTemplateName: string;
  fallbackTemplateLang: string;
  /**
   * When true, a free-form send that hits Meta 131047 ("24h window closed") is
   * retried as `fallbackTemplateName`. Default FALSE: the only configured
   * fallback template (`school_notification`) is PENDING, not APPROVED, so using
   * it would just produce a second failure. Set WHATSAPP_FALLBACK_ENABLED=true
   * ONLY after pointing WHATSAPP_FALLBACK_TEMPLATE_NAME at an APPROVED template.
   */
  fallbackEnabled: boolean;
  defaultCountryCode: string;
  maxRetries: number;
  httpTimeoutMs: number;
  dedupeWindowMs: number;
}

export type WhatsAppMode = 'live' | 'simulation';

export interface WhatsAppConfigResult {
  mode: WhatsAppMode;
  config: WhatsAppTenantConfig | null;
  errors: string[];
  warnings: string[];
}

export const DEFAULT_SCHOOL_ID = process.env.WHATSAPP_DEFAULT_SCHOOL_ID || 'default';

const DEFAULT_API_VERSION = 'v23.0';

const PLACEHOLDER_PATTERN = /^(your[_-]|<|\{|changeme|xxx|todo|placeholder|temp)/i;

function readEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim().replace(/^["']|["']$/g, '');
  return trimmed.length > 0 ? trimmed : undefined;
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = readEnv(name);
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

/**
 * Pure evaluation of the WhatsApp environment. Never throws; reports all
 * problems at once so a broken deployment can be fixed in one pass.
 */
export function evaluateWhatsAppEnv(): WhatsAppConfigResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const accessToken = readEnv('WHATSAPP_ACCESS_TOKEN');
  const phoneNumberId = readEnv('WHATSAPP_PHONE_NUMBER_ID');
  const businessAccountId = readEnv('WHATSAPP_BUSINESS_ACCOUNT_ID');
  const webhookVerifyToken = readEnv('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
  const appSecret = readEnv('WHATSAPP_APP_SECRET');
  const apiVersion = readEnv('WHATSAPP_API_VERSION') || DEFAULT_API_VERSION;

  const anySet = !!(accessToken || phoneNumberId || businessAccountId || webhookVerifyToken || appSecret);
  if (!anySet) {
    warnings.push(
      'No WHATSAPP_* environment variables set — WhatsApp runs in SIMULATION mode (messages are logged, not sent).'
    );
    return { mode: 'simulation', config: null, errors, warnings };
  }

  if (!accessToken) {
    errors.push('WHATSAPP_ACCESS_TOKEN is missing. Set the permanent System User access token in .env.');
  } else if (PLACEHOLDER_PATTERN.test(accessToken)) {
    errors.push('WHATSAPP_ACCESS_TOKEN looks like a placeholder value — set the real System User token.');
  } else if (accessToken.length < 50) {
    errors.push('WHATSAPP_ACCESS_TOKEN is suspiciously short — it does not look like a valid Meta access token.');
  }

  if (!phoneNumberId) {
    errors.push('WHATSAPP_PHONE_NUMBER_ID is missing (Meta Dashboard > WhatsApp > API Setup > Phone number ID).');
  } else if (!/^\d{5,20}$/.test(phoneNumberId)) {
    errors.push(`WHATSAPP_PHONE_NUMBER_ID must be numeric (got "${phoneNumberId.slice(0, 8)}…").`);
  }

  if (!businessAccountId) {
    errors.push('WHATSAPP_BUSINESS_ACCOUNT_ID is missing (Meta Dashboard > WhatsApp > API Setup > WABA ID).');
  } else if (!/^\d{5,20}$/.test(businessAccountId)) {
    errors.push(`WHATSAPP_BUSINESS_ACCOUNT_ID must be numeric (got "${businessAccountId.slice(0, 8)}…").`);
  }

  if (!/^v\d+(\.\d+)?$/.test(apiVersion)) {
    errors.push(`WHATSAPP_API_VERSION must look like "v23.0" (got "${apiVersion}").`);
  }

  if (!webhookVerifyToken) {
    warnings.push(
      'WHATSAPP_WEBHOOK_VERIFY_TOKEN is not set — Meta webhook verification (GET /api/whatsapp/webhook) will be rejected until it is configured.'
    );
  }

  if (!appSecret) {
    warnings.push(
      'WHATSAPP_APP_SECRET is not set — webhook payload signatures (X-Hub-Signature-256) CANNOT be verified. ' +
        'Set it from Meta App Dashboard > App Settings > Basic > App Secret to protect the webhook endpoint.'
    );
  }

  if (errors.length > 0) {
    return { mode: 'live', config: null, errors, warnings };
  }

  const config: WhatsAppTenantConfig = {
    schoolId: DEFAULT_SCHOOL_ID,
    accessToken: accessToken!,
    phoneNumberId: phoneNumberId!,
    businessAccountId: businessAccountId!,
    apiVersion,
    webhookVerifyToken,
    appSecret,
    fallbackTemplateName: readEnv('WHATSAPP_FALLBACK_TEMPLATE_NAME') || 'school_notification',
    fallbackTemplateLang: readEnv('WHATSAPP_FALLBACK_TEMPLATE_LANG') || 'en_US',
    fallbackEnabled: (readEnv('WHATSAPP_FALLBACK_ENABLED') || '').toLowerCase() === 'true',
    defaultCountryCode: readEnv('WHATSAPP_DEFAULT_COUNTRY_CODE') || '91',
    maxRetries: intEnv('WHATSAPP_MAX_RETRIES', 3, 0, 10),
    httpTimeoutMs: intEnv('WHATSAPP_HTTP_TIMEOUT_MS', 15000, 1000, 120000),
    dedupeWindowMs: intEnv('WHATSAPP_DEDUPE_WINDOW_MS', 60000, 0, 3600000)
  };

  return { mode: 'live', config, errors, warnings };
}

let cached: WhatsAppConfigResult | null = null;

function getEvaluated(): WhatsAppConfigResult {
  if (!cached) cached = evaluateWhatsAppEnv();
  return cached;
}

/** Test hook — clears the memoized config so env changes are re-read. */
export function resetWhatsAppConfigCache(): void {
  cached = null;
}

export function getWhatsAppMode(): WhatsAppMode {
  const result = getEvaluated();
  return result.mode === 'live' && result.config ? 'live' : 'simulation';
}

/**
 * Resolve the WhatsApp credentials for a school. Returns null in simulation mode.
 * Future multi-WABA support plugs in here — callers never see the difference.
 */
export function resolveTenantConfig(_schoolId: string = DEFAULT_SCHOOL_ID): WhatsAppTenantConfig | null {
  return getEvaluated().config;
}

/**
 * Startup gate. Throws a single aggregated Error when the WhatsApp environment
 * is partially/invalidly configured; logs warnings otherwise. Call before listen().
 */
export function assertWhatsAppConfig(): WhatsAppConfigResult {
  const result = getEvaluated();
  for (const warning of result.warnings) {
    console.warn(`[WhatsApp Config] WARNING: ${warning}`);
  }
  if (result.errors.length > 0) {
    const detail = result.errors.map((e) => `  - ${e}`).join('\n');
    throw new Error(
      `WhatsApp configuration is invalid — refusing to start.\n${detail}\n` +
        '(To run without WhatsApp entirely, remove ALL WHATSAPP_* variables from .env — the service then runs in simulation mode.)'
    );
  }
  if (result.mode === 'live') {
    console.log(
      `[WhatsApp Config] Live mode. Phone Number ID: ${result.config!.phoneNumberId}, WABA: ${result.config!.businessAccountId}, API ${result.config!.apiVersion}. Token loaded from environment (${result.config!.accessToken.length} chars, never logged).`
    );
  }
  return result;
}
