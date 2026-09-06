/**
 * Template registry + validation.
 * Pure functions — no env, no network, no DB.
 */
import { describe, it, expect } from 'vitest';
import {
  WHATSAPP_TEMPLATES,
  getRegisteredTemplate,
  resolveTemplateMessage
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
