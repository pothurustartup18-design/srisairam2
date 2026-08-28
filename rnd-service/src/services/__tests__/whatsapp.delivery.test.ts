import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetWhatsAppConfigCache } from '../../config/whatsapp';
import { SystemConfig } from '../../models/systemConfig.model';
import { WhatsAppMessage } from '../../models/whatsappMessage.model';

const { uploadGalleryMock } = vi.hoisted(() => ({
  uploadGalleryMock: vi.fn().mockResolvedValue('https://x.test/galleries/2026/bundle.html')
}));

vi.mock('../mediaGallery.service', () => ({
  uploadGallery: uploadGalleryMock
}));

import {
  resolveWhatsAppDelivery,
  dispatchResolvedDelivery,
  normalizeAttachments,
  _clearDedupeWindow
} from '../whatsapp.service';

const VALID_TOKEN = 'EAAG' + 'x'.repeat(120);

const okResponse = (wamid = 'wamid.TEST123') =>
  new Response(JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: wamid }] }), { status: 200 });

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
  uploadGalleryMock.mockClear();

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

describe('normalizeAttachments', () => {
  it('prefers the media array over a legacy single mediaUrl, carrying size through', () => {
    const result = normalizeAttachments({
      mediaUrl: 'https://x.test/legacy.jpg',
      media: [
        { url: 'https://x.test/a.jpg', type: 'image', size: 1234 },
        { url: 'https://x.test/b.mp3', type: 'audio', filename: 'b.mp3' }
      ]
    });
    expect(result).toEqual([
      { url: 'https://x.test/a.jpg', type: 'image', filename: undefined, size: 1234 },
      { url: 'https://x.test/b.mp3', type: 'audio', filename: 'b.mp3', size: undefined }
    ]);
  });

  it('falls back to the legacy single mediaUrl field when no media array is present', () => {
    const result = normalizeAttachments({ mediaUrl: 'https://x.test/legacy.jpg', mediaType: 'image', mediaFilename: 'legacy.jpg' });
    expect(result).toEqual([{ url: 'https://x.test/legacy.jpg', type: 'image', filename: 'legacy.jpg' }]);
  });

  it('returns an empty array when neither field is present', () => {
    expect(normalizeAttachments({ text: 'hi' })).toEqual([]);
  });

  it('drops malformed entries missing a url', () => {
    const result = normalizeAttachments({ media: [{ type: 'image' }, { url: 'https://x.test/ok.jpg', type: 'image' }] });
    expect(result).toEqual([{ url: 'https://x.test/ok.jpg', type: 'image', filename: undefined, size: undefined }]);
  });
});

describe('resolveWhatsAppDelivery — mode selection', () => {
  it('resolves to plain text when there are no attachments', async () => {
    const resolved = await resolveWhatsAppDelivery('hello', []);
    expect(resolved).toEqual({ mode: 'text', text: 'hello' });
    expect(uploadGalleryMock).not.toHaveBeenCalled();
  });

  it('resolves to native for a single attachment within its type size cap', async () => {
    const item = { url: 'https://x.test/pic.jpg', type: 'image' as const, size: 4 * 1024 * 1024 };
    const resolved = await resolveWhatsAppDelivery('caption', [item]);
    expect(resolved).toEqual({ mode: 'native', text: 'caption', item });
    expect(uploadGalleryMock).not.toHaveBeenCalled();
  });

  it('resolves to native when the single attachment has no known size (trusts it)', async () => {
    const item = { url: 'https://x.test/pic.jpg', type: 'image' as const };
    const resolved = await resolveWhatsAppDelivery('caption', [item]);
    expect(resolved.mode).toBe('native');
  });

  it('resolves to gallery when a single attachment exceeds its type size cap (e.g. a 20MB image)', async () => {
    const item = { url: 'https://x.test/huge.jpg', type: 'image' as const, size: 20 * 1024 * 1024 };
    const resolved = await resolveWhatsAppDelivery('check this out', [item]);
    expect(resolved.mode).toBe('gallery');
    expect(uploadGalleryMock).toHaveBeenCalledTimes(1);
    expect(uploadGalleryMock).toHaveBeenCalledWith([{ url: 'https://x.test/huge.jpg', type: 'image', filename: undefined }]);
    if (resolved.mode === 'gallery') {
      expect(resolved.text).toContain('check this out');
      expect(resolved.text).toContain('https://x.test/galleries/2026/bundle.html');
    }
  });

  it('resolves to gallery for 2+ attachments even if each is individually small', async () => {
    const resolved = await resolveWhatsAppDelivery('event photos', [
      { url: 'https://x.test/a.jpg', type: 'image', size: 100 },
      { url: 'https://x.test/b.mp4', type: 'video', size: 200 }
    ]);
    expect(resolved.mode).toBe('gallery');
    expect(uploadGalleryMock).toHaveBeenCalledTimes(1);
  });

  it('omits the leading text/blank line in the gallery message when there is no caption text', async () => {
    const resolved = await resolveWhatsAppDelivery('', [
      { url: 'https://x.test/a.jpg', type: 'image' },
      { url: 'https://x.test/b.mp4', type: 'video' }
    ]);
    if (resolved.mode === 'gallery') {
      expect(resolved.text.startsWith('📎 View attachment(s):')).toBe(true);
    } else {
      throw new Error('expected gallery mode');
    }
  });
});

describe('dispatchResolvedDelivery', () => {
  it('sends a text message for mode "text"', async () => {
    fetchMock.mockResolvedValueOnce(okResponse('wamid.TXT'));
    const result = await dispatchResolvedDelivery('8899582239', { mode: 'text', text: 'hello' });
    expect(result.success).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.type).toBe('text');
    expect(body.text.body).toBe('hello');
  });

  it('sends a native media message with the text as caption for mode "native"', async () => {
    fetchMock.mockResolvedValueOnce(okResponse('wamid.MEDIA'));
    const result = await dispatchResolvedDelivery('8899582239', {
      mode: 'native',
      text: 'look!',
      item: { url: 'https://x.test/pic.jpg', type: 'image' }
    });
    expect(result.success).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.type).toBe('image');
    expect(body.image.link).toBe('https://x.test/pic.jpg');
    expect(body.image.caption).toBe('look!');
  });

  it('sends a text message (with the gallery link already embedded) for mode "gallery"', async () => {
    fetchMock.mockResolvedValueOnce(okResponse('wamid.GAL'));
    const result = await dispatchResolvedDelivery('8899582239', {
      mode: 'gallery',
      text: 'files attached\n\n📎 View attachment(s): https://x.test/galleries/2026/bundle.html'
    });
    expect(result.success).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.type).toBe('text');
    expect(body.text.body).toContain('https://x.test/galleries/2026/bundle.html');
  });
});
