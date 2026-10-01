/**
 * sendTemplateNotificationSync — the synchronous, queue-bypassing send path used
 * ONLY where a database write must be conditioned on Meta's REAL response
 * (staff.credentials_new / staff.credentials_reset). Real whatsapp.service +
 * real dispatch() retry logic; Graph API itself is mocked via global fetch, the
 * same pattern whatsapp.send.test.ts uses.
 *
 * This file exists to prove the atomicity prerequisite at the infrastructure
 * level: "success" here must mean Meta actually accepted the message, including
 * after the existing in-process retry loop, never merely "no exception thrown."
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetWhatsAppConfigCache } from '../whatsapp';
import { SystemConfig } from '../../models/systemConfig.model';
import { WhatsAppMessage } from '../../models/whatsappMessage.model';
import { _clearDedupeWindow } from '../../services/whatsapp.service';
import { sendTemplateNotificationSync } from '../queue';

const VALID_TOKEN = 'EAAG' + 'x'.repeat(120);

const okResponse = (wamid = 'wamid.TEST123') =>
  new Response(JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: wamid }] }), { status: 200 });

const errorResponse = (httpStatus: number, code: number, message = 'meta error', headers?: Record<string, string>) =>
  new Response(JSON.stringify({ error: { message, type: 'OAuthException', code } }), { status: httpStatus, headers });

const STAFF_NEW_PARAMS = {
  name_en: 'Asha Rao', employee_id_en: 'EMP-100', temporary_pwd_en: 'a1b2c3d4',
  name_te: 'Asha Rao', employee_id_te: 'EMP-100', temporary_pwd_te: 'a1b2c3d4'
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.WHATSAPP_ACCESS_TOKEN = VALID_TOKEN;
  process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789012345';
  process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = '987654321098765';
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'verify';
  process.env.WHATSAPP_APP_SECRET = 'secret';
  process.env.WHATSAPP_MAX_RETRIES = '2';
  resetWhatsAppConfigCache();
  _clearDedupeWindow();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(WhatsAppMessage, 'create').mockResolvedValue({ statusHistory: [], save: vi.fn() } as any);
  vi.spyOn(WhatsAppMessage, 'findOne').mockResolvedValue(null);
  vi.spyOn(SystemConfig, 'findOne').mockResolvedValue(null);
  vi.spyOn(SystemConfig, 'findOneAndUpdate').mockResolvedValue({} as any);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  delete process.env.WHATSAPP_APP_SECRET;
  delete process.env.WHATSAPP_MAX_RETRIES;
  resetWhatsAppConfigCache();
  vi.restoreAllMocks();
});

describe('sendTemplateNotificationSync — staff.credentials_new', () => {
  it('Test 1: Meta accepts on the first attempt → success', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    const res = await sendTemplateNotificationSync('staff.credentials_new', {
      to: '8899582239',
      params: STAFF_NEW_PARAMS
    });
    expect(res.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('Test 2: Meta permanently rejects (bad template) → failure, no retry', async () => {
    fetchMock.mockResolvedValue(errorResponse(400, 132001, 'template not found'));
    const res = await sendTemplateNotificationSync('staff.credentials_new', {
      to: '8899582239',
      params: STAFF_NEW_PARAMS
    });
    expect(res.success).toBe(false);
    expect(res.reason).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('Test 3: Meta temporarily fails but the existing retry logic succeeds → success', async () => {
    fetchMock
      .mockResolvedValueOnce(errorResponse(500, 1, 'transient server error', { 'retry-after': '0' }))
      .mockResolvedValueOnce(okResponse());
    const res = await sendTemplateNotificationSync('staff.credentials_new', {
      to: '8899582239',
      params: STAFF_NEW_PARAMS
    });
    expect(res.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 15000);

  it('Test 4: Meta permanently fails after retries are exhausted (WHATSAPP_MAX_RETRIES=2 → 3 attempts) → failure', async () => {
    fetchMock.mockResolvedValue(errorResponse(500, 1, 'still down', { 'retry-after': '0' }));
    const res = await sendTemplateNotificationSync('staff.credentials_new', {
      to: '8899582239',
      params: STAFF_NEW_PARAMS
    });
    expect(res.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 15000);

  it('never calls Meta when the template payload itself is invalid (missing param)', async () => {
    const { temporary_pwd_te, ...incomplete } = STAFF_NEW_PARAMS;
    const res = await sendTemplateNotificationSync('staff.credentials_new', {
      to: '8899582239',
      params: incomplete
    });
    expect(res.success).toBe(false);
    expect(res.reason).toMatch(/temporary_pwd_te/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never calls Meta for an invalid recipient phone number', async () => {
    const res = await sendTemplateNotificationSync('staff.credentials_new', { to: '123', params: STAFF_NEW_PARAMS });
    expect(res.success).toBe(false);
    expect(res.reason).toMatch(/invalid recipient/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('sendTemplateNotificationSync — staff.credentials_reset', () => {
  it('reports the real Meta result, not just "no exception"', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    const res = await sendTemplateNotificationSync('staff.credentials_reset', {
      to: '8899582239',
      params: { username_en: 'emp-100', password_en: 'z9y8x7w6', username_te: 'emp-100', password_te: 'z9y8x7w6' }
    });
    expect(res.success).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.template.name).toBe('staff_credentials_reset');
  });
});

describe('sendTemplateNotificationSync — requireLiveSend fails closed on simulation mode in production', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

  beforeEach(() => {
    // No WHATSAPP_* vars at all → simulation mode, regardless of requireLiveSend.
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    delete process.env.WHATSAPP_APP_SECRET;
    resetWhatsAppConfigCache();
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it('a simulated send outside production still counts as success (local dev without real Meta creds keeps working)', async () => {
    process.env.NODE_ENV = 'development';
    const res = await sendTemplateNotificationSync(
      'staff.credentials_new',
      { to: '8899582239', params: STAFF_NEW_PARAMS },
      { requireLiveSend: true }
    );
    expect(res.success).toBe(true);
    expect(res.result?.simulated).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a simulated send in production is treated as FAILURE when requireLiveSend is set — a misconfigured deploy must not silently create accounts', async () => {
    process.env.NODE_ENV = 'production';
    const res = await sendTemplateNotificationSync(
      'staff.credentials_new',
      { to: '8899582239', params: STAFF_NEW_PARAMS },
      { requireLiveSend: true }
    );
    expect(res.success).toBe(false);
    expect(res.reason).toMatch(/simulat/i);
  });

  it('without requireLiveSend, a simulated send in production still counts as success (every other notification type is unaffected)', async () => {
    process.env.NODE_ENV = 'production';
    const res = await sendTemplateNotificationSync('staff.credentials_new', { to: '8899582239', params: STAFF_NEW_PARAMS });
    expect(res.success).toBe(true);
  });
});
