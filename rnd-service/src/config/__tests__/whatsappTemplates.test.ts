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
