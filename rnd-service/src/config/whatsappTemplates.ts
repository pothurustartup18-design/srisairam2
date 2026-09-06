/**
 * Central registry of Meta-approved WhatsApp templates used for PROACTIVE
 * (business-initiated) notifications.
 *
 * Meta template names, language codes and parameter names live ONLY here — never
 * inline in routes/services. Each entry mirrors the approved template exactly.
 *
 * Verified against the LIVE WABA (1559403392242390) on 2026-09-06 —
 * GET /v23.0/1559403392242390/message_templates :
 *
 *   attendance_alert_full        en  APPROVED  UTILITY  NAMED  BODY only
 *   attendance_alert_morning     en  APPROVED  UTILITY  NAMED  BODY only
 *   attendance_alert_afternoon   en  APPROVED  UTILITY  NAMED  BODY only
 *       body params: student_name_en, student_name_te
 *   fee_receipt                  en  APPROVED  UTILITY  NAMED  HEADER=DOCUMENT + BODY
 *       body params: amount_en, fee_name_en, student_name_en, receipt_number_en,
 *                    verification_url_en, student_name_te, fee_name_te, amount_te,
 *                    receipt_number_te, verification_url_te
 *   report_card_notice           en  APPROVED  UTILITY  NAMED  HEADER=DOCUMENT + BODY
 *       body params: student_name_en, student_name_te
 *
 * Every approved body text already contains BOTH the English and Telugu
 * sentences, so ONE template send covers both languages regardless of
 * student.preferredLanguage.
 *
 * NOT registered (deliberately): installment_reminder / installment_overdue /
 * announcement_broadcast / event_announcement are still "In review";
 * staff_credentials_new / staff_credentials_reset are Rejected; hello_world is
 * Meta's sample template. None of these may be wired.
 */

export type TemplateHeaderType = 'document' | 'image' | 'video';

export interface RegisteredTemplate {
  /** Exact Meta-approved template name. */
  metaName: string;
  /** Exact Meta-approved language code for this template version. */
  language: string;
  /**
   * Ordered named body parameters, exactly as approved
   * (the template's parameter_format is NAMED — these are `parameter_name`s,
   * never positional indexes).
   */
  parameters: readonly string[];
  /**
   * Set when the approved template has a media HEADER component. The caller must
   * then supply header media (see queueTemplateNotification `headerDocument`).
   */
  header?: { type: TemplateHeaderType };
  category: 'attendance' | 'fees' | 'reports' | 'announcements';
}

const ATTENDANCE_PARAMS = ['student_name_en', 'student_name_te'] as const;

export const WHATSAPP_TEMPLATES = {
  'attendance.full': {
    metaName: 'attendance_alert_full',
    language: 'en',
    parameters: ATTENDANCE_PARAMS,
    category: 'attendance'
  },
  'attendance.morning': {
    metaName: 'attendance_alert_morning',
    language: 'en',
    parameters: ATTENDANCE_PARAMS,
    category: 'attendance'
  },
  'attendance.afternoon': {
    metaName: 'attendance_alert_afternoon',
    language: 'en',
    parameters: ATTENDANCE_PARAMS,
    category: 'attendance'
  },
  'fee.receipt': {
    metaName: 'fee_receipt',
    language: 'en',
    parameters: [
      'amount_en',
      'fee_name_en',
      'student_name_en',
      'receipt_number_en',
      'verification_url_en',
      'student_name_te',
      'fee_name_te',
      'amount_te',
      'receipt_number_te',
      'verification_url_te'
    ],
    header: { type: 'document' },
    category: 'fees'
  },
  'report.card': {
    metaName: 'report_card_notice',
    language: 'en',
    parameters: ATTENDANCE_PARAMS, // student_name_en, student_name_te
    header: { type: 'document' },
    category: 'reports'
  }
} as const satisfies Record<string, RegisteredTemplate>;

export type TemplateKey = keyof typeof WHATSAPP_TEMPLATES;

export function getRegisteredTemplate(key: string): RegisteredTemplate | undefined {
  return (WHATSAPP_TEMPLATES as Record<string, RegisteredTemplate>)[key];
}

export interface ResolvedTemplateMessage {
  /** Registry key, e.g. "attendance.full". */
  key: string;
  /** Meta template name to send. */
  metaName: string;
  /** Meta language code to send. */
  language: string;
  /**
   * parameter_name -> text, ordered to match the approved template. This maps
   * directly onto the Cloud API `components[].parameters[]` with `parameter_name`.
   */
  named: Record<string, string>;
  /** The media HEADER this template requires, if any. */
  header?: { type: TemplateHeaderType };
}

export type TemplateResolution =
  | { ok: true; message: ResolvedTemplateMessage }
  | { ok: false; error: string };

/**
 * Validate a template key + supplied params against the registry BEFORE anything
 * is queued or sent, so a malformed Meta request can never leave the building.
 *
 * Fails when:
 *  - the key is not registered
 *  - a required named parameter is missing / null / blank
 *  - an unexpected parameter is supplied
 *
 * Header media is validated separately by queueTemplateNotification (it is not a
 * body parameter).
 */
export function resolveTemplateMessage(key: string, params: Record<string, unknown>): TemplateResolution {
  const def = getRegisteredTemplate(key);
  if (!def) {
    return { ok: false, error: `unknown template key "${key}" (not in the WhatsApp template registry)` };
  }

  const supplied = Object.keys(params || {});

  const missing = def.parameters.filter(
    (p) => params?.[p] === undefined || params?.[p] === null || String(params[p]).trim() === ''
  );
  if (missing.length > 0) {
    return { ok: false, error: `template "${key}" is missing required parameter(s): ${missing.join(', ')}` };
  }

  const allowed = new Set<string>(def.parameters);
  const unexpected = supplied.filter((p) => !allowed.has(p));
  if (unexpected.length > 0) {
    return { ok: false, error: `template "${key}" received unexpected parameter(s): ${unexpected.join(', ')}` };
  }

  const named: Record<string, string> = {};
  for (const p of def.parameters) named[p] = String(params[p]).trim();

  return {
    ok: true,
    message: { key, metaName: def.metaName, language: def.language, named, header: def.header }
  };
}
