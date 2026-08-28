import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import {
  verifyWebhookSignature,
  markEventSeen,
  _clearSeenEvents,
  processWebhookPayload,
  getWebhookStats
} from '../whatsappWebhook.processor';
import { statusTransitionAllowed, WhatsAppMessage } from '../../models/whatsappMessage.model';
import { SystemConfig } from '../../models/systemConfig.model';
import { Student } from '../../models/student.model';
import { Teacher } from '../../models/teacher.model';

const APP_SECRET = 'test_app_secret';

const sign = (body: string, secret = APP_SECRET) =>
  'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

beforeEach(() => {
  vi.spyOn(WhatsAppMessage, 'findOne').mockResolvedValue({
    status: 'sent',
    statusHistory: [],
    save: vi.fn().mockResolvedValue({} as any)
  } as any);
  vi.spyOn(WhatsAppMessage, 'create').mockResolvedValue({
    statusHistory: [],
    save: vi.fn().mockResolvedValue({} as any)
  } as any);
  vi.spyOn(SystemConfig, 'findOne').mockResolvedValue(null);
  vi.spyOn(SystemConfig, 'findOneAndUpdate').mockResolvedValue({} as any);
  vi.spyOn(Student, 'find').mockResolvedValue([]);
  vi.spyOn(Teacher, 'find').mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyWebhookSignature', () => {
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });

  it('accepts a valid signature', () => {
    expect(verifyWebhookSignature(APP_SECRET, body, sign(body))).toBe(true);
  });

  it('accepts Buffer bodies (raw body from express verify hook)', () => {
    const buf = Buffer.from(body, 'utf8');
    expect(verifyWebhookSignature(APP_SECRET, buf, sign(body))).toBe(true);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verifyWebhookSignature(APP_SECRET, body, sign(body, 'wrong_secret'))).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyWebhookSignature(APP_SECRET, body + 'x', sign(body))).toBe(false);
  });

  it('rejects missing or malformed headers', () => {
    expect(verifyWebhookSignature(APP_SECRET, body, undefined)).toBe(false);
    expect(verifyWebhookSignature(APP_SECRET, body, 'md5=abc')).toBe(false);
    expect(verifyWebhookSignature(APP_SECRET, body, 'sha256=nothex!!')).toBe(false);
    expect(verifyWebhookSignature(APP_SECRET, body, 'sha256=deadbeef')).toBe(false);
  });
});

describe('duplicate webhook protection', () => {
  beforeEach(() => _clearSeenEvents());

  it('accepts an event the first time and rejects replays', () => {
    expect(markEventSeen('status:wamid.X:delivered')).toBe(true);
    expect(markEventSeen('status:wamid.X:delivered')).toBe(false);
    expect(markEventSeen('status:wamid.X:read')).toBe(true); // different status = different event
  });
});

describe('status lifecycle idempotency', () => {
  it('only allows forward transitions', () => {
    expect(statusTransitionAllowed('sent', 'delivered')).toBe(true);
    expect(statusTransitionAllowed('delivered', 'read')).toBe(true);
    expect(statusTransitionAllowed('queued', 'sent')).toBe(true);
  });

  it('rejects regressions and self-transitions (replayed webhooks)', () => {
    expect(statusTransitionAllowed('read', 'delivered')).toBe(false);
    expect(statusTransitionAllowed('delivered', 'sent')).toBe(false);
    expect(statusTransitionAllowed('delivered', 'delivered')).toBe(false);
  });

  it('failed is terminal and cannot apply after delivery', () => {
    expect(statusTransitionAllowed('failed', 'sent')).toBe(false);
    expect(statusTransitionAllowed('sent', 'failed')).toBe(true);
    expect(statusTransitionAllowed('delivered', 'failed')).toBe(false);
    expect(statusTransitionAllowed('read', 'failed')).toBe(false);
  });
});

describe('processWebhookPayload', () => {
  beforeEach(() => _clearSeenEvents());

  it('never throws on malformed payloads', async () => {
    await expect(processWebhookPayload(undefined)).resolves.toBeUndefined();
    await expect(processWebhookPayload({})).resolves.toBeUndefined();
    await expect(processWebhookPayload({ object: 'something_else' })).resolves.toBeUndefined();
    await expect(processWebhookPayload({ object: 'whatsapp_business_account', entry: [{ changes: [{}] }] })).resolves.toBeUndefined();
  });

  it('records webhook activity for health checks and walks every entry/change', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            { value: { statuses: [{ id: 'wamid.A', status: 'delivered', recipient_id: '918899582239' }] } },
            { value: { statuses: [{ id: 'wamid.B', status: 'read', recipient_id: '918899582239' }] } }
          ]
        },
        { changes: [{ value: { messages: [{ id: 'wamid.C', from: '918899582239', type: 'text', text: { body: 'hi' } }] } }] }
      ]
    };
    await processWebhookPayload(payload);
    const stats = getWebhookStats();
    expect(stats.lastWebhookAt).toBeInstanceOf(Date);
    expect(stats.lastStatusUpdateAt).toBeInstanceOf(Date);
    // duplicate delivery of the same status is now suppressed
    expect(markEventSeen('status:wamid.A:delivered')).toBe(false);
    expect(markEventSeen('msg:wamid.C')).toBe(false);
  });
});
