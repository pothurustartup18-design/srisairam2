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
 *   attendance_alert_full        en  APPROVED  UTILITY    NAMED  BODY only
 *   attendance_alert_morning     en  APPROVED  UTILITY    NAMED  BODY only
 *   attendance_alert_afternoon   en  APPROVED  UTILITY    NAMED  BODY only
 *       body params: student_name_en, student_name_te
 *   fee_receipt                  en  APPROVED  UTILITY    NAMED  HEADER=DOCUMENT + BODY
 *       body params: amount_en, fee_name_en, student_name_en, receipt_number_en,
 *                    verification_url_en, student_name_te, fee_name_te, amount_te,
 *                    receipt_number_te, verification_url_te
 *   report_card_notice           en  APPROVED  UTILITY    NAMED  HEADER=DOCUMENT + BODY
 *       body params: student_name_en, student_name_te
 *   installment_overdue          en  APPROVED  UTILITY    NAMED  BODY only
 *       body params: installment_no_en, amount_en, student_name_en, due_date_en,
 *                    installment_no_te, amount_te, student_name_te, due_date_te
 *   installment_reminder         en  APPROVED  UTILITY    NAMED  BODY only
 *       LIVE body params (verified against Meta 2026-09-09):
 *         student_name_en, fee_type_en, amount_en,
 *         student_name_te, fee_type_te, amount_te
 *       The approved body is a bilingual GENERAL fee/dues reminder
 *       ("Fee Reminder … Fee Type: {{fee_type_en}} … Pending Amount: ₹{{amount_en}}").
 *       Registered TWICE, on purpose:
 *         - key 'fee.general_reminder' → the LIVE 6-param structure (used by the
 *           Admin → Reminders/Fee "🚀" button + bulk + scheduled fee reminders;
 *           fee_type = School Fee / Bus Fee / Books Fee / Total Outstanding Fees).
 *         - key 'installment.reminder' → the OLD 8-param installment structure,
 *           still referenced by runInstallmentReminderSweep. NOTE: the approved
 *           template no longer matches those 8 params — that sweep path predates
 *           the template edit and is out of scope here.
 *   announcement_broadcast       en  APPROVED  MARKETING  NAMED  BODY only
 *       body params: custom
 *   event_announcement           en  APPROVED  MARKETING  NAMED  BODY only
 *       body params: event_title, event_date, event_description
 *
 * Every approved body text already contains BOTH the English and Telugu
 * sentences (where bilingual), so ONE template send covers both languages
 * regardless of student.preferredLanguage.
 *
 * NOT registered (deliberately):
 *   - staff_credentials_new / staff_credentials_reset — REJECTED by Meta
 *   - hello_world — Meta's sample template, never a production notification
 *   - school_notification — PENDING (not APPROVED); must not be used as a live
 *     fallback (see WHATSAPP_FALLBACK_ENABLED in config/whatsapp.ts)
 */

export type TemplateHeaderType = 'document' | 'image' | 'video';

export interface RegisteredTemplate {
  /** Exact Meta-approved template name. */
  metaName: string;
  /** Exact Meta-approved language code for this template version. */
  language: string;
  /** Meta category, for documentation/observability only. */
  category: 'attendance' | 'fees' | 'reports' | 'announcements';
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
}

const ATTENDANCE_PARAMS = ['student_name_en', 'student_name_te'] as const;
const INSTALLMENT_PARAMS = [
  'installment_no_en',
  'amount_en',
  'student_name_en',
  'due_date_en',
  'installment_no_te',
  'amount_te',
  'student_name_te',
  'due_date_te'
] as const;

export const WHATSAPP_TEMPLATES = {
  'attendance.full': {
    metaName: 'attendance_alert_full',
    language: 'en',
    category: 'attendance',
    parameters: ATTENDANCE_PARAMS
  },
  'attendance.morning': {
    metaName: 'attendance_alert_morning',
    language: 'en',
    category: 'attendance',
    parameters: ATTENDANCE_PARAMS
  },
  'attendance.afternoon': {
    metaName: 'attendance_alert_afternoon',
    language: 'en',
    category: 'attendance',
    parameters: ATTENDANCE_PARAMS
  },
  'fee.receipt': {
    metaName: 'fee_receipt',
    language: 'en',
    category: 'fees',
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
    header: { type: 'document' }
  },
  'report.card': {
    metaName: 'report_card_notice',
    language: 'en',
    category: 'reports',
    parameters: ATTENDANCE_PARAMS, // student_name_en, student_name_te
    header: { type: 'document' }
  },
  'installment.reminder': {
    metaName: 'installment_reminder',
    language: 'en',
    category: 'fees',
    parameters: INSTALLMENT_PARAMS
  },
  'installment.overdue': {
    metaName: 'installment_overdue',
    language: 'en',
    category: 'fees',
    parameters: INSTALLMENT_PARAMS
  },
  'fee.general_reminder': {
    // The approved `installment_reminder` template is (as of 2026-09-09) a
    // bilingual GENERAL fee reminder — NAMED params student_name / fee_type /
    // amount, no installment number, no due date. Used "as is" for the
    // individual "🚀" + bulk + scheduled fee reminders.
    metaName: 'installment_reminder',
    language: 'en',
    category: 'fees',
    // _te values mirror _en for student_name and amount (only the sentence
    // wrapper differs in the approved template); fee_type_en / fee_type_te are
    // the localized labels for the admin's selection (School Fee / Bus Fee /
    // Books Fee / Total Outstanding Fees).
    parameters: [
      'student_name_en',
      'fee_type_en',
      'amount_en',
      'student_name_te',
      'fee_type_te',
      'amount_te'
    ]
  },
  'announcement.broadcast': {
    metaName: 'announcement_broadcast',
    language: 'en',
    category: 'announcements',
    parameters: ['custom']
  },
  'event.announcement': {
    metaName: 'event_announcement',
    language: 'en',
    category: 'announcements',
    parameters: ['event_title', 'event_date', 'event_description']
  }
} as const satisfies Record<string, RegisteredTemplate>;

export type TemplateKey = keyof typeof WHATSAPP_TEMPLATES;

export function getRegisteredTemplate(key: string): RegisteredTemplate | undefined {
  return (WHATSAPP_TEMPLATES as Record<string, RegisteredTemplate>)[key];
}

/**
 * PROACTIVE notifications the ERP has, but for which NO approved Meta template
 * exists. Per policy these MUST NOT be sent as free-form WhatsApp (Meta rejects
 * proactive free-form outside the 24h window anyway). Each entry names the
 * template that needs to be created + approved in WhatsApp Manager.
 *
 * `blockedNotice(key)` returns the standard "not sent" payload for a route.
 */
export const MISSING_TEMPLATES = {
  'transport.alert':
    'Transport / "school bus approaching" cluster alert. Needs an approved UTILITY template, ' +
    'e.g. transport_bus_alert (fixed text) or transport_alert with a single {custom} param.',
  'staff.credentials':
    'Staff onboarding / password-reset credentials. staff_credentials_new and staff_credentials_reset are ' +
    'REJECTED by Meta; school_notification is PENDING. Needs new approved templates before any WhatsApp delivery.',
  'auth.otp':
    'Password-reset / phone-verification / profile-update OTP. Should use a Meta AUTHENTICATION-category ' +
    'template (e.g. otp_code with one {code} param + copy-code button). Currently sent free-form — allowed ' +
    'as an OTP exception, but delivery is unreliable to numbers outside an open conversation.'
} as const;

export type MissingTemplateKey = keyof typeof MISSING_TEMPLATES;

export function blockedNotice(key: MissingTemplateKey) {
  return {
    success: false as const,
    blocked: true as const,
    reason: 'NO_APPROVED_TEMPLATE' as const,
    missingTemplate: key,
    message:
      `No approved WhatsApp template exists for this notification, so it was NOT sent ` +
      `(proactive free-form WhatsApp is disabled). ${MISSING_TEMPLATES[key]}`
  };
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
