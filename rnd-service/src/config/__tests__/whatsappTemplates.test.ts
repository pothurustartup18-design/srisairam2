/**
 * Template registry + validation.
 * Pure functions — no env, no network, no DB.
 */
import { describe, it, expect } from 'vitest';
import {
  WHATSAPP_TEMPLATES,
  getRegisteredTemplate,
  resolveTemplateMessage,
  MISSING_TEMPLATES,
  blockedNotice
} from '../whatsappTemplates';

const NAME = { student_name_en: 'Harsha', student_name_te: 'Harsha' };

describe('WhatsApp template registry', () => {
  it('maps full / morning / afternoon to the approved Meta template names', () => {
    expect(WHATSAPP_TEMPLATES['attendance.full'].metaName).toBe('attendance_alert_full');
    expect(WHATSAPP_TEMPLATES['attendance.morning'].metaName).toBe('attendance_alert_morning');
    expect(WHATSAPP_TEMPLATES['attendance.afternoon'].metaName).toBe('attendance_alert_afternoon');
  });

  it('uses language "en" and named params student_name_en / student_name_te for every attendance template', () => {
    for (const key of ['attendance.full', 'attendance.morning', 'attendance.afternoon'] as const) {
      const def = getRegisteredTemplate(key)!;
      expect(def.language).toBe('en');
      expect(def.parameters).toEqual(['student_name_en', 'student_name_te']);
      expect(def.category).toBe('attendance');
    }
  });
});

describe('resolveTemplateMessage', () => {
  it('resolves a full-day attendance template with ordered named params', () => {
    const res = resolveTemplateMessage('attendance.full', NAME);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.message.metaName).toBe('attendance_alert_full');
    expect(res.message.language).toBe('en');
    expect(res.message.named).toEqual({ student_name_en: 'Harsha', student_name_te: 'Harsha' });
    expect(Object.keys(res.message.named)).toEqual(['student_name_en', 'student_name_te']);
  });

  it('resolves morning and afternoon templates', () => {
    expect((resolveTemplateMessage('attendance.morning', NAME) as any).message.metaName).toBe('attendance_alert_morning');
    expect((resolveTemplateMessage('attendance.afternoon', NAME) as any).message.metaName).toBe('attendance_alert_afternoon');
  });

  it('trims parameter values', () => {
    const res = resolveTemplateMessage('attendance.full', { student_name_en: '  Ravi  ', student_name_te: '  Ravi  ' });
    expect((res as any).message.named).toEqual({ student_name_en: 'Ravi', student_name_te: 'Ravi' });
  });

  it('rejects an unknown template key', () => {
    const res = resolveTemplateMessage('attendance.unknown', NAME);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/unknown template key/);
  });

  it('rejects a missing required parameter', () => {
    const res = resolveTemplateMessage('attendance.full', { student_name_en: 'Harsha' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/missing required parameter\(s\): student_name_te/);
  });

  it('rejects a blank required parameter', () => {
    const res = resolveTemplateMessage('attendance.full', { student_name_en: 'Harsha', student_name_te: '   ' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/student_name_te/);
  });

  it('rejects unexpected parameters (no silent drop)', () => {
    const res = resolveTemplateMessage('attendance.full', { ...NAME, class_name: '5A' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/unexpected parameter\(s\): class_name/);
  });
});

const FEE_PARAMS = {
  amount_en: '986',
  fee_name_en: 'Tuition Fee',
  student_name_en: 'Harsha',
  receipt_number_en: 'FEE-2026-1',
  verification_url_en: 'https://erp.example.com/?verify_token=FEE-2026-1',
  student_name_te: 'Harsha',
  fee_name_te: 'పాఠశాల రుసుము',
  amount_te: '986',
  receipt_number_te: 'FEE-2026-1',
  verification_url_te: 'https://erp.example.com/?verify_token=FEE-2026-1'
};

describe('document templates: fee.receipt', () => {
  it('maps to fee_receipt / en with a document header and 10 named params', () => {
    const def = getRegisteredTemplate('fee.receipt')!;
    expect(def.metaName).toBe('fee_receipt');
    expect(def.language).toBe('en');
    expect(def.header).toEqual({ type: 'document' });
    expect(def.parameters).toHaveLength(10);
    expect(def.parameters).toEqual([
      'amount_en', 'fee_name_en', 'student_name_en', 'receipt_number_en', 'verification_url_en',
      'student_name_te', 'fee_name_te', 'amount_te', 'receipt_number_te', 'verification_url_te'
    ]);
  });

  it('resolves with all 10 params and surfaces the header requirement', () => {
    const res = resolveTemplateMessage('fee.receipt', FEE_PARAMS);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.message.metaName).toBe('fee_receipt');
    expect(res.message.header).toEqual({ type: 'document' });
    expect(Object.keys(res.message.named)).toHaveLength(10);
  });

  it('rejects when a body param is missing', () => {
    const { verification_url_te, ...rest } = FEE_PARAMS;
    const res = resolveTemplateMessage('fee.receipt', rest);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/verification_url_te/);
  });

  it('rejects an unexpected param', () => {
    const res = resolveTemplateMessage('fee.receipt', { ...FEE_PARAMS, txn_id: 'X' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/unexpected parameter\(s\): txn_id/);
  });
});

describe('document templates: report.card', () => {
  it('maps to report_card_notice / en with a document header and 2 named params', () => {
    const def = getRegisteredTemplate('report.card')!;
    expect(def.metaName).toBe('report_card_notice');
    expect(def.language).toBe('en');
    expect(def.header).toEqual({ type: 'document' });
    expect(def.parameters).toEqual(['student_name_en', 'student_name_te']);
  });

  it('resolves with the student name in both params', () => {
    const res = resolveTemplateMessage('report.card', NAME);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.message.named).toEqual({ student_name_en: 'Harsha', student_name_te: 'Harsha' });
    expect(res.message.header).toEqual({ type: 'document' });
  });
});

describe('attendance templates carry no header', () => {
  it('has no header field', () => {
    for (const key of ['attendance.full', 'attendance.morning', 'attendance.afternoon'] as const) {
      expect(getRegisteredTemplate(key)!.header).toBeUndefined();
    }
  });
});

const INSTALLMENT = {
  installment_no_en: '1', amount_en: '2,500', student_name_en: 'Harsha', due_date_en: '10 September 2026',
  installment_no_te: '1', amount_te: '2,500', student_name_te: 'Harsha', due_date_te: '10 September 2026'
};

describe('installment templates', () => {
  it('installment.reminder → installment_reminder / en / 8 named params / no header', () => {
    const def = getRegisteredTemplate('installment.reminder')!;
    expect(def.metaName).toBe('installment_reminder');
    expect(def.language).toBe('en');
    expect(def.header).toBeUndefined();
    expect(def.parameters).toEqual([
      'installment_no_en', 'amount_en', 'student_name_en', 'due_date_en',
      'installment_no_te', 'amount_te', 'student_name_te', 'due_date_te'
    ]);
  });

  it('installment.overdue → installment_overdue / en / same 8 params', () => {
    const def = getRegisteredTemplate('installment.overdue')!;
    expect(def.metaName).toBe('installment_overdue');
    expect(def.parameters).toEqual(getRegisteredTemplate('installment.reminder')!.parameters);
  });

  it('resolves with all 8 params', () => {
    for (const key of ['installment.reminder', 'installment.overdue'] as const) {
      const res = resolveTemplateMessage(key, INSTALLMENT);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(Object.keys(res.message.named)).toHaveLength(8);
      expect(res.message.named.due_date_te).toBe('10 September 2026');
    }
  });

  it('rejects when an installment param is missing', () => {
    const { due_date_te, ...rest } = INSTALLMENT;
    const res = resolveTemplateMessage('installment.reminder', rest);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/due_date_te/);
  });
});

describe('announcement + event templates (MARKETING, text-only)', () => {
  it('announcement.broadcast → announcement_broadcast / en / param: custom', () => {
    const def = getRegisteredTemplate('announcement.broadcast')!;
    expect(def.metaName).toBe('announcement_broadcast');
    expect(def.language).toBe('en');
    expect(def.header).toBeUndefined();
    expect(def.parameters).toEqual(['custom']);
  });

  it('event.announcement → event_announcement / en / params: event_title, event_date, event_description', () => {
    const def = getRegisteredTemplate('event.announcement')!;
    expect(def.metaName).toBe('event_announcement');
    expect(def.parameters).toEqual(['event_title', 'event_date', 'event_description']);
    expect(def.header).toBeUndefined();
  });

  it('resolves announcement.broadcast with { custom }', () => {
    const res = resolveTemplateMessage('announcement.broadcast', { custom: 'School closed tomorrow.' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.message.metaName).toBe('announcement_broadcast');
    expect(res.message.named).toEqual({ custom: 'School closed tomorrow.' });
  });

  it('resolves event.announcement with the 3 event params', () => {
    const res = resolveTemplateMessage('event.announcement', {
      event_title: 'Sports Day', event_date: '20 September 2026', event_description: 'Annual sports day.'
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.message.named).toEqual({
      event_title: 'Sports Day', event_date: '20 September 2026', event_description: 'Annual sports day.'
    });
  });

  it('rejects announcement.broadcast with a stray param', () => {
    const res = resolveTemplateMessage('announcement.broadcast', { custom: 'hi', title: 'x' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/unexpected parameter\(s\): title/);
  });
});

describe('registry completeness — every active production template is registered', () => {
  it('has exactly the 9 expected keys → exact Meta names', () => {
    const expected: Record<string, string> = {
      'attendance.full': 'attendance_alert_full',
      'attendance.morning': 'attendance_alert_morning',
      'attendance.afternoon': 'attendance_alert_afternoon',
      'fee.receipt': 'fee_receipt',
      'report.card': 'report_card_notice',
      'installment.reminder': 'installment_reminder',
      'installment.overdue': 'installment_overdue',
      'announcement.broadcast': 'announcement_broadcast',
      'event.announcement': 'event_announcement'
    };
    expect(Object.keys(WHATSAPP_TEMPLATES).sort()).toEqual(Object.keys(expected).sort());
    for (const [k, meta] of Object.entries(expected)) {
      expect(getRegisteredTemplate(k)!.metaName).toBe(meta);
      expect(getRegisteredTemplate(k)!.language).toBe('en');
    }
  });

  it('never registers a rejected / test / pending template', () => {
    const banned = ['staff_credentials_new', 'staff_credentials_reset', 'hello_world', 'school_notification'];
    const registered = Object.values(WHATSAPP_TEMPLATES).map((t) => t.metaName);
    for (const b of banned) expect(registered).not.toContain(b);
  });
});

describe('MISSING_TEMPLATES / blockedNotice — proactive features with no approved template', () => {
  it('documents the 4 known gaps', () => {
    expect(Object.keys(MISSING_TEMPLATES).sort()).toEqual(
      ['auth.otp', 'fee.general_reminder', 'staff.credentials', 'transport.alert'].sort()
    );
  });

  it('blockedNotice returns a non-success, non-retryable "not sent" payload', () => {
    const n = blockedNotice('fee.general_reminder');
    expect(n.success).toBe(false);
    expect(n.blocked).toBe(true);
    expect(n.reason).toBe('NO_APPROVED_TEMPLATE');
    expect(n.missingTemplate).toBe('fee.general_reminder');
    expect(n.message).toMatch(/was NOT sent/);
    expect(n.message).toMatch(/installment_reminder/);
  });

  it('blockedNotice covers transport + staff credentials', () => {
    expect(blockedNotice('transport.alert').message).toMatch(/bus/i);
    expect(blockedNotice('staff.credentials').message).toMatch(/REJECTED/);
  });
});
