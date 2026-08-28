import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { evaluateWhatsAppEnv, resetWhatsAppConfigCache, assertWhatsAppConfig, getWhatsAppMode } from '../../config/whatsapp';

const WHATSAPP_KEYS = [
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_BUSINESS_ACCOUNT_ID',
  'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_API_VERSION'
];

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of WHATSAPP_KEYS) {
    if (!(key in saved)) saved[key] = process.env[key];
    delete process.env[key];
  }
  resetWhatsAppConfigCache();
});

afterAll(() => {
  for (const key of WHATSAPP_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  resetWhatsAppConfigCache();
});

const VALID_TOKEN = 'EAAG' + 'x'.repeat(120);

describe('WhatsApp config validation', () => {
  it('runs in simulation mode when no WHATSAPP_* vars are set', () => {
    const result = evaluateWhatsAppEnv();
    expect(result.mode).toBe('simulation');
    expect(result.config).toBeNull();
    expect(result.errors).toHaveLength(0);
    expect(getWhatsAppMode()).toBe('simulation');
  });

  it('fails hard on partial configuration (token set, ids missing)', () => {
    process.env.WHATSAPP_ACCESS_TOKEN = VALID_TOKEN;
    resetWhatsAppConfigCache();
    const result = evaluateWhatsAppEnv();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(() => assertWhatsAppConfig()).toThrow(/refusing to start/i);
  });

  it('rejects placeholder tokens', () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'your_token_here_your_token_here_your_token_here_your_token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789012345';
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = '987654321098765';
    resetWhatsAppConfigCache();
    const result = evaluateWhatsAppEnv();
    expect(result.errors.some((e) => /placeholder/i.test(e))).toBe(true);
  });

  it('rejects non-numeric phone number id', () => {
    process.env.WHATSAPP_ACCESS_TOKEN = VALID_TOKEN;
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'not-a-number';
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = '987654321098765';
    resetWhatsAppConfigCache();
    const result = evaluateWhatsAppEnv();
    expect(result.errors.some((e) => /PHONE_NUMBER_ID/i.test(e))).toBe(true);
  });

  it('accepts a fully valid configuration and reports live mode', () => {
    process.env.WHATSAPP_ACCESS_TOKEN = VALID_TOKEN;
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789012345';
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = '987654321098765';
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'verify_me';
    process.env.WHATSAPP_APP_SECRET = 'appsecret123';
    resetWhatsAppConfigCache();
    const result = evaluateWhatsAppEnv();
    expect(result.errors).toHaveLength(0);
    expect(result.config?.phoneNumberId).toBe('123456789012345');
    expect(result.config?.apiVersion).toMatch(/^v\d+/);
    expect(getWhatsAppMode()).toBe('live');
  });

  it('warns (not errors) when app secret / verify token are missing', () => {
    process.env.WHATSAPP_ACCESS_TOKEN = VALID_TOKEN;
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789012345';
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = '987654321098765';
    resetWhatsAppConfigCache();
    const result = evaluateWhatsAppEnv();
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some((w) => /WHATSAPP_APP_SECRET/.test(w))).toBe(true);
    expect(result.warnings.some((w) => /VERIFY_TOKEN/.test(w))).toBe(true);
  });

  it('rejects malformed API version', () => {
    process.env.WHATSAPP_ACCESS_TOKEN = VALID_TOKEN;
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789012345';
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = '987654321098765';
    process.env.WHATSAPP_API_VERSION = '17';
    resetWhatsAppConfigCache();
    const result = evaluateWhatsAppEnv();
    expect(result.errors.some((e) => /API_VERSION/i.test(e))).toBe(true);
  });
});
