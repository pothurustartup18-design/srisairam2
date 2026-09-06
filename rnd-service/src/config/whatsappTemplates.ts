/**
 * Central registry of Meta-approved WhatsApp templates used for PROACTIVE
 * (business-initiated) notifications.
 *
 * Meta template names, language codes and parameter names live ONLY here — never
 * inline in routes/services. Each entry mirrors the approved template exactly.
 *
 * Verified against the live WABA (1559403392242390) on 2026-09-06:
 *   attendance_alert_full       en  APPROVED  UTILITY  parameter_format=NAMED
 *   attendance_alert_morning    en  APPROVED  UTILITY  parameter_format=NAMED
 *   attendance_alert_afternoon  en  APPROVED  UTILITY  parameter_format=NAMED
 * Body params for all three: student_name_en, student_name_te (single BODY
 * component, no header/buttons). The approved body text already contains BOTH
 * the English and Telugu sentences, so ONE template send covers both languages.
 *
 * Only attendance templates are wired up for now. fee_receipt / report_card_notice
 * and the pending installment/announcement/event templates are intentionally NOT
 * added yet.
 */

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
  category: 'attendance' | 'fees' | 'reports' | 'announcements';
}

export const WHATSAPP_TEMPLATES = {
  'attendance.full': {
    metaName: 'attendance_alert_full',
    language: 'en',
    parameters: ['student_name_en', 'student_name_te'],
    category: 'attendance'
  },
  'attendance.morning': {
    metaName: 'attendance_alert_morning',
    language: 'en',
    parameters: ['student_name_en', 'student_name_te'],
    category: 'attendance'
  },
  'attendance.afternoon': {
    metaName: 'attendance_alert_afternoon',
    language: 'en',
    parameters: ['student_name_en', 'student_name_te'],
    category: 'attendance'
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

  return { ok: true, message: { key, metaName: def.metaName, language: def.language, named } };
}
