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
 *   event_announcement_media     en  APPROVED  MARKETING  NAMED  BODY only
 *       Verified against Meta 2026-09-20. Same body as event_announcement plus
 *       one extra param: body params: event_title, event_date, event_description,
 *       media_url. NOTE media_url is a plain BODY text param (no HEADER
 *       component on this template) — it must be a clean single-line URL with
 *       NO embedded newlines/control characters, or Meta rejects the whole
 *       send with HTTP 400 / code 132018 ("issue with the parameters"). Used
 *       instead of event_announcement whenever the event has attachments, with
 *       media_url = the permanent gallery link (GET /api/events/:eventId/media).
 *       event_description must stay the admin's raw text here — do NOT
 *       concatenate the link into it (that's what caused the 132018s above).
 *   transport_bus_alert          en  APPROVED  UTILITY    NAMED  BODY only
 *       Verified against Meta 2026-09-22. body params: message, school_name.
 *       No HEADER, so no media can ride along — text only.
 *   o_auth                       en  ACTIVE (quality pending)  AUTHENTICATION  POSITIONAL  BODY + BUTTON
 *       Verified via WhatsApp Manager UI on 2026-09-29. Meta's stock
 *       authentication body: "{{1}} is your verification code. For your
 *       security, do not share this code." with a single positional param
 *       (the code) plus a "Copy code" OTP button. Authentication templates
 *       never take NAMED params and always carry the code again in a BUTTON
 *       component (Cloud API: button sub_type "copy_code", parameter type
 *       "coupon_code") — see `parameterFormat`/`otpButton` below.
 *   staff_credentials_new        en  APPROVED  (category not yet confirmed —
 *       treated as UTILITY here for billing only; verify in WhatsApp Manager)
 *       Verified via WhatsApp Manager UI on 2026-09-29. NAMED, no header.
 *       body params: name_en, employee_id_en, temporary_password_en,
 *                    name_te, employee_id_te, temporary_password_te
 *   staff_credentials_reset      en  APPROVED  (category not yet confirmed —
 *       treated as UTILITY here for billing only; verify in WhatsApp Manager)
 *       Verified via WhatsApp Manager UI on 2026-09-29. NAMED, no header.
 *       body params: username_en, password_en, username_te, password_te
 *
 * Every approved body text already contains BOTH the English and Telugu
 * sentences (where bilingual), so ONE template send covers both languages
 * regardless of student.preferredLanguage.
 *
 * NOT registered (deliberately):
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
  category: 'attendance' | 'fees' | 'reports' | 'announcements' | 'transport' | 'authentication' | 'staff';
  /**
   * Ordered body parameters, exactly as approved. For `parameterFormat: 'named'`
   * (the default — every template except `auth.otp`) these are `parameter_name`s.
   * For `parameterFormat: 'positional'` this is the ORDER of positional slots
   * ({{1}}, {{2}}, …); the keys are internal-only and never sent to Meta.
   */
  parameters: readonly string[];
  /**
   * Meta's Cloud API body format for this template. Defaults to 'named'.
   * AUTHENTICATION-category templates are always 'positional' — Meta rejects
   * `parameter_name` on them.
   */
  parameterFormat?: 'named' | 'positional';
  /**
   * Set when the approved template has a media HEADER component. The caller must
   * then supply header media (see queueTemplateNotification `headerDocument`).
   */
  header?: { type: TemplateHeaderType };
  /**
   * Set for AUTHENTICATION templates with a "Copy code" / one-tap-autofill
   * button. The Cloud API requires the OTP value a second time in a dedicated
   * BUTTON component (sub_type "copy_code") alongside the BODY parameter.
   * Only meaningful when there is exactly one body parameter (the code).
   */
  otpButton?: boolean;
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
  },
  'event.announcement_media': {
    metaName: 'event_announcement_media',
    language: 'en',
    category: 'announcements',
    // media_url is a plain BODY param (this template has no HEADER
    // component) — must be a clean single-line URL, no newlines.
    parameters: ['event_title', 'event_date', 'event_description', 'media_url']
  },
  'transport.alert': {
    metaName: 'transport_bus_alert',
    language: 'en',
    category: 'transport',
    parameters: ['message', 'school_name']
  },
  'auth.otp': {
    metaName: 'o_auth',
    language: 'en',
    category: 'authentication',
    parameterFormat: 'positional',
    otpButton: true,
    // Single positional slot ({{1}}) — the OTP code. Key name is internal only.
    parameters: ['code']
  },
  'staff.credentials_new': {
    metaName: 'staff_credentials_new',
    language: 'en',
    category: 'staff',
    parameters: [
      'name_en',
      'employee_id_en',
      'temporary_password_en',
      'name_te',
      'employee_id_te',
      'temporary_password_te'
    ]
  },
  'staff.credentials_reset': {
    metaName: 'staff_credentials_reset',
    language: 'en',
    category: 'staff',
    parameters: ['username_en', 'password_en', 'username_te', 'password_te']
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
 * Empty as of 2026-09-29 — `o_auth`, `staff_credentials_new` and
 * `staff_credentials_reset` are now APPROVED and registered above.
 */
export const MISSING_TEMPLATES = {} as const;

export interface ResolvedTemplateMessage {
  /** Registry key, e.g. "attendance.full". */
  key: string;
  /** Meta template name to send. */
  metaName: string;
  /** Meta language code to send. */
  language: string;
  /**
   * parameter_name -> text, ordered to match the approved template. For a
   * 'positional' template this is still keyed by the registry's internal
   * parameter names — the caller converts it to an ordered array using
   * `parameters` order (see queueTemplateNotification).
   */
  named: Record<string, string>;
  /** Meta's Cloud API body format for this template. */
  parameterFormat: 'named' | 'positional';
  /** Whether this template needs a "Copy code" BUTTON component (see RegisteredTemplate.otpButton). */
  otpButton: boolean;
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
    message: {
      key,
      metaName: def.metaName,
      language: def.language,
      named,
      parameterFormat: def.parameterFormat ?? 'named',
      otpButton: def.otpButton ?? false,
      header: def.header
    }
  };
}
