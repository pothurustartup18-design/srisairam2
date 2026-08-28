import { describe, it, expect } from 'vitest';
import { normalizePhone, formatPhoneNumber } from '../whatsapp.service';

describe('normalizePhone (E.164)', () => {
  it('prepends 91 to a bare 10-digit Indian number', () => {
    expect(normalizePhone('8899582239')).toEqual({ ok: true, e164: '918899582239' });
  });

  it('accepts numbers already in E.164 with +', () => {
    expect(normalizePhone('+918899582239')).toEqual({ ok: true, e164: '918899582239' });
  });

  it('strips spaces, dashes and parentheses', () => {
    expect(normalizePhone('+91 88995-82239')).toEqual({ ok: true, e164: '918899582239' });
    expect(normalizePhone('(91) 8899 582 239')).toEqual({ ok: true, e164: '918899582239' });
  });

  it('strips the Indian trunk 0 prefix', () => {
    expect(normalizePhone('08899582239')).toEqual({ ok: true, e164: '918899582239' });
  });

  it('strips the 00 international dialing prefix', () => {
    expect(normalizePhone('00918899582239')).toEqual({ ok: true, e164: '918899582239' });
  });

  it('respects a custom default country code', () => {
    expect(normalizePhone('5551234567', '1')).toEqual({ ok: true, e164: '15551234567' });
  });

  it('rejects too-short numbers', () => {
    const result = normalizePhone('12345');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/length/);
  });

  it('rejects too-long numbers', () => {
    expect(normalizePhone('1234567890123456789').ok).toBe(false);
  });

  it('rejects empty input', () => {
    expect(normalizePhone('').ok).toBe(false);
    expect(normalizePhone(undefined as unknown as string).ok).toBe(false);
  });

  it('formatPhoneNumber stays backward compatible', () => {
    expect(formatPhoneNumber('8899582239')).toBe('918899582239');
    expect(formatPhoneNumber('+918899582239')).toBe('918899582239');
  });
});
