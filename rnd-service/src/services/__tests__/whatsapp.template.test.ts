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
import {
  sendWhatsAppTemplate,
  buildTemplateComponents,
  buildTemplateHeaderComponent,
  _clearDedupeWindow
} from '../whatsapp.service';

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

describe('buildTemplateHeaderComponent', () => {
  it('builds a DOCUMENT header with filename', () => {
    expect(
      buildTemplateHeaderComponent({ type: 'document', link: 'https://s3/x.pdf', filename: 'receipt_FEE-1.pdf' })
    ).toEqual({
      type: 'header',
      parameters: [{ type: 'document', document: { link: 'https://s3/x.pdf', filename: 'receipt_FEE-1.pdf' } }]
    });
  });

  it('builds an IMAGE header (no filename key)', () => {
    expect(buildTemplateHeaderComponent({ type: 'image', link: 'https://s3/x.jpg' })).toEqual({
      type: 'header',
      parameters: [{ type: 'image', image: { link: 'https://s3/x.jpg' } }]
    });
  });
});

describe('sendWhatsAppTemplate — DOCUMENT header (fee_receipt / report_card_notice)', () => {
  const FEE_PARAMS = {
    amount_en: '986',
    fee_name_en: 'Tuition Fee',
    student_name_en: 'Harsha',
    receipt_number_en: 'FEE-2026-390014',
    verification_url_en: 'https://erp.example.com/?verify_token=FEE-2026-390014',
    student_name_te: 'Harsha',
    fee_name_te: 'పాఠశాల రుసుము',
    amount_te: '986',
    receipt_number_te: 'FEE-2026-390014',
    verification_url_te: 'https://erp.example.com/?verify_token=FEE-2026-390014'
  };

  it('puts the header component first, then the body, with parameter_name on all 10 body params', async () => {
    fetchMock.mockResolvedValueOnce(okResponse('wamid.FEE'));
    const result = await sendWhatsAppTemplate('8899582239', 'fee_receipt', 'en', FEE_PARAMS, {
      templateHeader: { type: 'document', link: 'https://s3/receipt_FEE-2026-390014.pdf', filename: 'receipt_FEE-2026-390014.pdf' }
    });
    expect(result.success).toBe(true);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.template.name).toBe('fee_receipt');
    const [header, bodyComp] = body.template.components;
    expect(header).toEqual({
      type: 'header',
      parameters: [
        { type: 'document', document: { link: 'https://s3/receipt_FEE-2026-390014.pdf', filename: 'receipt_FEE-2026-390014.pdf' } }
      ]
    });
    expect(bodyComp.type).toBe('body');
    expect(bodyComp.parameters).toHaveLength(10);
    expect(bodyComp.parameters.every((p: any) => typeof p.parameter_name === 'string' && p.type === 'text')).toBe(true);
    expect(bodyComp.parameters.map((p: any) => p.parameter_name)).toEqual(Object.keys(FEE_PARAMS));
  });

  it('report_card_notice: header + 2 named body params', async () => {
    fetchMock.mockResolvedValueOnce(okResponse('wamid.RC'));
    await sendWhatsAppTemplate('8899582239', 'report_card_notice', 'en', {
      student_name_en: 'Aarav Patel',
      student_name_te: 'Aarav Patel'
    }, {
      templateHeader: { type: 'document', link: 'https://s3/rc.pdf', filename: 'report_card_ADM1.pdf' }
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.template.components[0].type).toBe('header');
    expect(body.template.components[0].parameters[0].document.filename).toBe('report_card_ADM1.pdf');
    expect(body.template.components[1].parameters.map((p: any) => p.parameter_name)).toEqual([
      'student_name_en',
      'student_name_te'
    ]);
  });

  it('records templateName for a document template', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    await sendWhatsAppTemplate('8899582239', 'fee_receipt', 'en', FEE_PARAMS, {
      templateHeader: { type: 'document', link: 'https://s3/r.pdf', filename: 'r.pdf' }
    });
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ messageType: 'template', templateName: 'fee_receipt' })
    );
  });
});

describe('sendWhatsAppTemplate — installment / announcement / event (BODY-only, NAMED)', () => {
  const INSTALLMENT = {
    installment_no_en: '2', amount_en: '2,500', student_name_en: 'Aarav Patel', due_date_en: '10 September 2026',
    installment_no_te: '2', amount_te: '2,500', student_name_te: 'Aarav Patel', due_date_te: '10 September 2026'
  };

  it.each(['installment_reminder', 'installment_overdue'])('%s → 8 named body params, no header', async (metaName) => {
    fetchMock.mockResolvedValueOnce(okResponse('wamid.INST'));
    const result = await sendWhatsAppTemplate('8899582239', metaName, 'en', INSTALLMENT);
    expect(result.success).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.type).toBe('template');
    expect(body.template.name).toBe(metaName);
    expect(body.template.language).toEqual({ code: 'en' });
    expect(body.template.components).toHaveLength(1); // body only, no header
    expect(body.template.components[0].type).toBe('body');
    expect(body.template.components[0].parameters).toHaveLength(8);
    expect(body.template.components[0].parameters.every((p: any) => typeof p.parameter_name === 'string')).toBe(true);
    expect(body.template.components[0].parameters.map((p: any) => p.parameter_name).sort()).toEqual(
      Object.keys(INSTALLMENT).sort()
    );
  });

  it('announcement_broadcast → single named param "custom"', async () => {
    fetchMock.mockResolvedValueOnce(okResponse('wamid.ANN'));
    await sendWhatsAppTemplate('8899582239', 'announcement_broadcast', 'en', { custom: 'School closed tomorrow.' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.template.name).toBe('announcement_broadcast');
    expect(body.template.components[0].parameters).toEqual([
      { type: 'text', parameter_name: 'custom', text: 'School closed tomorrow.' }
    ]);
  });

  it('event_announcement → event_title / event_date / event_description', async () => {
    fetchMock.mockResolvedValueOnce(okResponse('wamid.EVT'));
    await sendWhatsAppTemplate('8899582239', 'event_announcement', 'en', {
      event_title: 'Sports Day', event_date: '20 September 2026', event_description: 'Annual sports day.'
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.template.name).toBe('event_announcement');
    expect(body.template.components[0].parameters).toEqual([
      { type: 'text', parameter_name: 'event_title', text: 'Sports Day' },
      { type: 'text', parameter_name: 'event_date', text: '20 September 2026' },
      { type: 'text', parameter_name: 'event_description', text: 'Annual sports day.' }
    ]);
  });

  it('classifies a Meta template-not-approved (132001) as a PERMANENT (non-retryable) error', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: 'template does not exist', type: 'OAuthException', code: 132001 } }),
        { status: 400 }
      )
    );
    const result = await sendWhatsAppTemplate('8899582239', 'installment_reminder', 'en', INSTALLMENT);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(132001);
    expect(result.error?.retryable).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1); // not retried in-process
  });
});
