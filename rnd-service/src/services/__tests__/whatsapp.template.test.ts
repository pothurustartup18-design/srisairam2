/**
 * Template send pipeline — NAMED-parameter payload representation, positional
 * regression, WhatsAppMessage.templateName recording, and dedupe.
 *
 * Graph API is mocked; MongoDB models are stubbed (same approach as
 * whatsapp.send.test.ts).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetWhatsAppConfigCache } from '../../config/whatsapp';
import { SystemConfig } from '../../models/systemConfig.model';
import { WhatsAppMessage } from '../../models/whatsappMessage.model';
import { sendWhatsAppTemplate, buildTemplateComponents, _clearDedupeWindow } from '../whatsapp.service';

const VALID_TOKEN = 'EAAG' + 'x'.repeat(120);

const okResponse = (wamid = 'wamid.TPL') =>
  new Response(JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: wamid }] }), { status: 200 });

let fetchMock: ReturnType<typeof vi.fn>;
let createSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.WHATSAPP_ACCESS_TOKEN = VALID_TOKEN;
  process.env.WHATSAPP_PHONE_NUMBER_ID = '1402594769594243';
  process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = '1559403392242390';
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'verify';
  process.env.WHATSAPP_APP_SECRET = 'secret';
  process.env.WHATSAPP_MAX_RETRIES = '2';
  resetWhatsAppConfigCache();
  _clearDedupeWindow();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  createSpy = vi
    .spyOn(WhatsAppMessage, 'create')
    .mockResolvedValue({ statusHistory: [], save: vi.fn() } as any);
  vi.spyOn(WhatsAppMessage, 'findOne').mockResolvedValue(null);
  vi.spyOn(SystemConfig, 'findOne').mockResolvedValue(null);
  vi.spyOn(SystemConfig, 'findOneAndUpdate').mockResolvedValue({} as any);
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of [
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_BUSINESS_ACCOUNT_ID',
    'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    'WHATSAPP_APP_SECRET',
    'WHATSAPP_MAX_RETRIES'
  ]) {
    delete process.env[k];
  }
  resetWhatsAppConfigCache();
  vi.restoreAllMocks();
});

describe('buildTemplateComponents', () => {
  it('emits parameter_name for NAMED params', () => {
    const components = buildTemplateComponents({ student_name_en: 'Harsha', student_name_te: 'Harsha' });
    expect(components).toEqual([
      {
        type: 'body',
        parameters: [
          { type: 'text', parameter_name: 'student_name_en', text: 'Harsha' },
          { type: 'text', parameter_name: 'student_name_te', text: 'Harsha' }
        ]
      }
    ]);
  });

  it('emits NO parameter_name for positional params', () => {
    const components = buildTemplateComponents(['John', '5000']);
    expect(components).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'John' }, { type: 'text', text: '5000' }] }
    ]);
  });

  it('returns undefined when there are no params', () => {
    expect(buildTemplateComponents([])).toBeUndefined();
    expect(buildTemplateComponents({})).toBeUndefined();
  });
});

describe('sendWhatsAppTemplate — named parameters (attendance_alert_full)', () => {
  it('sends the correct Meta Cloud API payload with named parameters', async () => {
    fetchMock.mockResolvedValueOnce(okResponse('wamid.FULL'));

    const result = await sendWhatsAppTemplate('8899582239', 'attendance_alert_full', 'en', {
      student_name_en: 'Harsha',
      student_name_te: 'Harsha'
    });

    expect(result.success).toBe(true);
    expect(result.wamid).toBe('wamid.FULL');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v23.0/1402594769594243/messages');
    expect(init.headers.Authorization).toBe(`Bearer ${VALID_TOKEN}`);

    const body = JSON.parse(init.body);
    expect(body.to).toBe('918899582239'); // normalized E.164
    expect(body.type).toBe('template');
    expect(body.template.name).toBe('attendance_alert_full');
    expect(body.template.language).toEqual({ code: 'en' });
    expect(body.template.components).toEqual([
      {
        type: 'body',
        parameters: [
          { type: 'text', parameter_name: 'student_name_en', text: 'Harsha' },
          { type: 'text', parameter_name: 'student_name_te', text: 'Harsha' }
        ]
      }
    ]);
  });

  it.each([
    ['attendance_alert_full', 'wamid.F'],
    ['attendance_alert_morning', 'wamid.M'],
    ['attendance_alert_afternoon', 'wamid.A']
  ])('sends %s as a named-parameter template', async (metaName, wamid) => {
    fetchMock.mockResolvedValueOnce(okResponse(wamid));
    const result = await sendWhatsAppTemplate('8899582239', metaName, 'en', {
      student_name_en: 'Ravi',
      student_name_te: 'Ravi'
    });
    expect(result.success).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.template.name).toBe(metaName);
    expect(body.template.components[0].parameters.map((p: any) => p.parameter_name)).toEqual([
      'student_name_en',
      'student_name_te'
    ]);
  });

  it('records templateName on the WhatsAppMessage', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    await sendWhatsAppTemplate('8899582239', 'attendance_alert_morning', 'en', {
      student_name_en: 'Harsha',
      student_name_te: 'Harsha'
    });
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ messageType: 'template', templateName: 'attendance_alert_morning' })
    );
  });

  it('suppresses an identical template send inside the dedupe window', async () => {
    fetchMock.mockResolvedValue(okResponse());
    const first = await sendWhatsAppTemplate('8899582239', 'attendance_alert_full', 'en', {
      student_name_en: 'Harsha',
      student_name_te: 'Harsha'
    });
    const second = await sendWhatsAppTemplate('8899582239', 'attendance_alert_full', 'en', {
      student_name_en: 'Harsha',
      student_name_te: 'Harsha'
    });
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.deduped).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('sendWhatsAppTemplate — positional parameters (regression)', () => {
  it('still sends positional params with no parameter_name', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    const result = await sendWhatsAppTemplate('8899582239', 'fee_reminder', 'en_US', ['John', '5000']);
    expect(result.success).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.template.components[0].parameters).toEqual([
      { type: 'text', text: 'John' },
      { type: 'text', text: '5000' }
    ]);
    expect(body.template.components[0].parameters[0]).not.toHaveProperty('parameter_name');
  });
});
