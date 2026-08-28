/**
 * Integration-style tests for the send pipeline with a mocked Graph API.
 * MongoDB is intentionally disconnected — persistence is skipped, exercising
 * the same code path used in offline/mock mode.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetWhatsAppConfigCache } from '../../config/whatsapp';
import { SystemConfig } from '../../models/systemConfig.model';
import { WhatsAppMessage } from '../../models/whatsappMessage.model';
import {
  sendWhatsAppText,
  sendWhatsAppTextDetailed,
  sendWhatsAppTemplate,
  sendWhatsAppMediaDetailed,
  _clearDedupeWindow
} from '../whatsapp.service';

const VALID_TOKEN = 'EAAG' + 'x'.repeat(120);

const okResponse = (wamid = 'wamid.TEST123') =>
  new Response(JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: wamid }] }), { status: 200 });

const errorResponse = (httpStatus: number, code: number, message = 'meta error', headers?: Record<string, string>) =>
  new Response(JSON.stringify({ error: { message, type: 'OAuthException', code } }), { status: httpStatus, headers });

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

  // Mock MongoDB models to avoid buffering timeouts
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

describe('sendWhatsAppText', () => {
  it('sends successfully and returns the Meta message id', async () => {
    fetchMock.mockResolvedValueOnce(okResponse('wamid.ABC'));
    const result = await sendWhatsAppTextDetailed('8899582239', 'hello');
    expect(result.success).toBe(true);
    expect(result.wamid).toBe('wamid.ABC');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v23.0/123456789012345/messages');
    expect(init.headers.Authorization).toBe(`Bearer ${VALID_TOKEN}`);
    const body = JSON.parse(init.body);
    expect(body.to).toBe('918899582239'); // normalized to E.164
    expect(body.type).toBe('text');
    expect(body.text.body).toBe('hello');
  });

  it('retries transient 429 with backoff and then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(errorResponse(429, 130429, 'rate limit', { 'retry-after': '0' }))
      .mockResolvedValueOnce(okResponse());
    const ok = await sendWhatsAppText('8899582239', 'retry me');
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 15000);

  it('retries network failures', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce(okResponse());
    const ok = await sendWhatsAppText('8899582239', 'flaky network');
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 15000);

  it('does NOT retry permanent failures (invalid recipient, 131026)', async () => {
    fetchMock.mockResolvedValue(errorResponse(400, 131026, 'undeliverable'));
    const result = await sendWhatsAppTextDetailed('8899582239', 'nope');
    expect(result.success).toBe(false);
    expect(result.error?.retryable).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retry
  });

  it('does NOT retry invalid/expired token (190)', async () => {
    fetchMock.mockResolvedValue(errorResponse(401, 190, 'token expired'));
    const result = await sendWhatsAppTextDetailed('8899582239', 'auth fail');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(190);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid phone numbers without calling Meta', async () => {
    const result = await sendWhatsAppTextDetailed('12345', 'bad number');
    expect(result.success).toBe(false);
    expect(result.error?.reason).toMatch(/invalid phone number/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the approved template when the 24h window is closed (131047)', async () => {
    fetchMock
      .mockResolvedValueOnce(errorResponse(400, 131047, 're-engagement required'))
      .mockResolvedValueOnce(okResponse('wamid.TPL'));
    const result = await sendWhatsAppTextDetailed('8899582239', 'window closed');
    expect(result.success).toBe(true);
    expect(result.usedFallbackTemplate).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondBody.type).toBe('template');
    expect(secondBody.template.name).toBe('school_notification');
    expect(secondBody.template.components[0].parameters[0].text).toBe('window closed');
  }, 15000);

  it('does not recurse if the fallback template itself hits 131047', async () => {
    fetchMock.mockResolvedValue(errorResponse(400, 131047, 're-engagement required'));
    const result = await sendWhatsAppTextDetailed('8899582239', 'double window');
    expect(result.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2); // original + one fallback, no infinite loop
  });

  it('suppresses accidental duplicate sends inside the dedupe window', async () => {
    fetchMock.mockResolvedValue(okResponse());
    const first = await sendWhatsAppTextDetailed('8899582239', 'same message');
    const second = await sendWhatsAppTextDetailed('8899582239', 'same message');
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.deduped).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1); // only one real API call
  });

  it('simulates (no network call) when WhatsApp is not configured', async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    delete process.env.WHATSAPP_APP_SECRET;
    resetWhatsAppConfigCache();
    const result = await sendWhatsAppTextDetailed('8899582239', 'dev mode');
    expect(result.success).toBe(true);
    expect(result.simulated).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never throws even if fetch behaves pathologically', async () => {
    fetchMock.mockImplementation(() => {
      throw new TypeError('totally broken');
    });
    await expect(sendWhatsAppText('8899582239', 'boom')).resolves.toBe(false);
  }, 15000);
});

describe('sendWhatsAppTemplate', () => {
  it('sends a template with body parameters', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    const result = await sendWhatsAppTemplate('8899582239', 'fee_reminder', 'en_US', ['John', '5000']);
    expect(result.success).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.type).toBe('template');
    expect(body.template.name).toBe('fee_reminder');
    expect(body.template.language.code).toBe('en_US');
    expect(body.template.components[0].parameters).toHaveLength(2);
  });

  it('reports rejected templates as permanent failures', async () => {
    fetchMock.mockResolvedValue(errorResponse(400, 132001, 'template not found'));
    const result = await sendWhatsAppTemplate('8899582239', 'ghost_template', 'en_US');
    expect(result.success).toBe(false);
    expect(result.error?.retryable).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('sendWhatsAppMedia', () => {
  it('sends an image with caption', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    const result = await sendWhatsAppMediaDetailed('8899582239', 'https://x.test/pic.jpg', 'image', undefined, 'look!');
    expect(result.success).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.type).toBe('image');
    expect(body.image.link).toBe('https://x.test/pic.jpg');
    expect(body.image.caption).toBe('look!');
  });

  it('converts WebP images to documents (Meta does not accept WebP images)', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    await sendWhatsAppMediaDetailed('8899582239', 'https://x.test/sticker.webp', 'image');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.type).toBe('document');
    expect(body.document.filename).toBe('announcement.webp');
  });

  it('sends documents with filename', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    await sendWhatsAppMediaDetailed('8899582239', 'https://x.test/r.pdf', 'document', 'receipt.pdf', 'Your receipt');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.document.filename).toBe('receipt.pdf');
    expect(body.document.caption).toBe('Your receipt');
  });
});

describe('WhatsApp Quota and Limits', () => {
  let currentSentCount = 0;
  let currentLimit = 5;

  beforeEach(() => {
    currentSentCount = 0;
    currentLimit = 5;

    vi.spyOn(SystemConfig, 'findOne').mockImplementation((async (query: any) => {
      if (query.key === 'whatsappLimit') return { key: 'whatsappLimit', value: String(currentLimit) } as any;
      if (query.key === 'whatsappSentCount') return { key: 'whatsappSentCount', value: String(currentSentCount) } as any;
      return null;
    }) as any);

    vi.spyOn(SystemConfig, 'findOneAndUpdate').mockImplementation((async (query: any, update: any) => {
      if (query.key === 'whatsappSentCount') {
        if (update.$inc && update.$inc.value) {
          currentSentCount += update.$inc.value;
        } else if (update.$set && update.$set.value) {
          currentSentCount = update.$set.value;
        }
        return { key: 'whatsappSentCount', value: String(currentSentCount) } as any;
      }
      return null;
    }) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('blocks sending when limit is exceeded', async () => {
    currentSentCount = 5;
    const result = await sendWhatsAppTextDetailed('8899582239', 'test msg');
    expect(result.success).toBe(false);
    expect(result.error?.reason).toContain('quota exceeded');
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it('increments counter upon successful simulated send', async () => {
    // Force simulation mode by clearing all credentials
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    resetWhatsAppConfigCache();

    currentSentCount = 0;
    const result = await sendWhatsAppTextDetailed('8899582239', 'test simulation');
    expect(result.success).toBe(true);
    expect(result.simulated).toBe(true);
    expect(currentSentCount).toBe(1);
  });

  it('increments counter upon successful live send', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    currentSentCount = 0;
    const result = await sendWhatsAppTextDetailed('8899582239', 'test live');
    expect(result.success).toBe(true);
    expect(currentSentCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
