/**
 * queueTemplateNotification — validation gate + queue→worker dispatch contract.
 *
 * bullmq and redis are mocked so no real connection is opened. whatsapp.service
 * is real except sendWhatsAppTemplate (stubbed) so the synchronous fallback path
 * can be asserted without hitting Graph.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { redisState } = vi.hoisted(() => ({ redisState: { status: 'ready' } as { status: string } }));

vi.mock('bullmq', () => ({
  Queue: class {
    add = vi.fn().mockResolvedValue({ id: 'job-1' });
  }
}));
vi.mock('../redis', () => ({ default: redisState }));
vi.mock('../../services/whatsapp.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/whatsapp.service')>();
  return { ...actual, sendWhatsAppTemplate: vi.fn().mockResolvedValue({ success: true }) };
});

import { queueTemplateNotification, notificationQueue, NOTIFICATION_JOB_OPTIONS } from '../queue';
import { sendWhatsAppTemplate } from '../../services/whatsapp.service';

const addMock = notificationQueue.add as unknown as ReturnType<typeof vi.fn>;
const sendTemplateMock = sendWhatsAppTemplate as unknown as ReturnType<typeof vi.fn>;

const NAME = { student_name_en: 'Harsha', student_name_te: 'Harsha' };

beforeEach(() => {
  redisState.status = 'ready';
  addMock.mockClear();
  sendTemplateMock.mockClear();
});

describe('queueTemplateNotification — enqueue (Redis ready)', () => {
  it('enqueues a sendWhatsAppTemplate job with the resolved Meta template + named params', async () => {
    const res = await queueTemplateNotification('attendance.full', {
      to: '8899582239',
      params: NAME,
      dedupeKey: 'attendance:2026-09-06:stu1:full'
    });

    expect(res).toEqual({ queued: true });
    expect(addMock).toHaveBeenCalledTimes(1);
    expect(addMock).toHaveBeenCalledWith(
      'sendWhatsAppTemplate',
      {
        to: '8899582239',
        templateKey: 'attendance.full',
        templateName: 'attendance_alert_full',
        languageCode: 'en',
        named: { student_name_en: 'Harsha', student_name_te: 'Harsha' },
        dedupeKey: 'attendance:2026-09-06:stu1:full'
      },
      NOTIFICATION_JOB_OPTIONS
    );
    expect(sendTemplateMock).not.toHaveBeenCalled();
  });

  it('maps morning / afternoon to their Meta template names', async () => {
    await queueTemplateNotification('attendance.morning', { to: '8899582239', params: NAME });
    await queueTemplateNotification('attendance.afternoon', { to: '8899582239', params: NAME });
    expect(addMock.mock.calls[0][1].templateName).toBe('attendance_alert_morning');
    expect(addMock.mock.calls[1][1].templateName).toBe('attendance_alert_afternoon');
  });
});

describe('queueTemplateNotification — validation gate (nothing queued or sent)', () => {
  it('rejects an unknown template key', async () => {
    const res = await queueTemplateNotification('attendance.bogus', { to: '8899582239', params: NAME });
    expect(res.queued).toBe(false);
    expect(res.reason).toMatch(/unknown template key/);
    expect(addMock).not.toHaveBeenCalled();
    expect(sendTemplateMock).not.toHaveBeenCalled();
  });

  it('rejects missing named parameters', async () => {
    const res = await queueTemplateNotification('attendance.full', {
      to: '8899582239',
      params: { student_name_en: 'Harsha' }
    });
    expect(res.queued).toBe(false);
    expect(res.reason).toMatch(/student_name_te/);
    expect(addMock).not.toHaveBeenCalled();
  });

  it('rejects unexpected parameters', async () => {
    const res = await queueTemplateNotification('attendance.full', {
      to: '8899582239',
      params: { ...NAME, extra: 'x' }
    });
    expect(res.queued).toBe(false);
    expect(res.reason).toMatch(/unexpected parameter/);
    expect(addMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid recipient phone number', async () => {
    const res = await queueTemplateNotification('attendance.full', { to: '12345', params: NAME });
    expect(res.queued).toBe(false);
    expect(res.reason).toMatch(/invalid recipient/);
    expect(addMock).not.toHaveBeenCalled();
    expect(sendTemplateMock).not.toHaveBeenCalled();
  });
});

describe('queueTemplateNotification — synchronous fallback (Redis down)', () => {
  it('sends the template directly, bypassing the queue', async () => {
    redisState.status = 'end';
    const res = await queueTemplateNotification('attendance.afternoon', {
      to: '8899582239',
      params: NAME,
      dedupeKey: 'k2'
    });
    expect(res).toEqual({ queued: true });
    expect(addMock).not.toHaveBeenCalled();
    expect(sendTemplateMock).toHaveBeenCalledWith(
      '8899582239',
      'attendance_alert_afternoon',
      'en',
      { student_name_en: 'Harsha', student_name_te: 'Harsha' },
      { dedupeKey: 'k2' }
    );
  });
});

const FEE_PARAMS = {
  amount_en: '986', fee_name_en: 'Tuition Fee', student_name_en: 'Harsha',
  receipt_number_en: 'FEE-1', verification_url_en: 'https://e/v/FEE-1',
  student_name_te: 'Harsha', fee_name_te: 'పాఠశాల రుసుము', amount_te: '986',
  receipt_number_te: 'FEE-1', verification_url_te: 'https://e/v/FEE-1'
};

describe('queueTemplateNotification — document-header templates', () => {
  it('enqueues fee.receipt with the header in the job payload', async () => {
    const res = await queueTemplateNotification('fee.receipt', {
      to: '8899582239',
      params: FEE_PARAMS,
      dedupeKey: 'fee-receipt:FEE-1',
      headerDocument: { link: 'https://s3/receipt_FEE-1.pdf', filename: 'receipt_FEE-1.pdf' }
    });
    expect(res).toEqual({ queued: true });
    const [jobName, jobData, opts] = addMock.mock.calls[0];
    expect(jobName).toBe('sendWhatsAppTemplate');
    expect(opts).toBe(NOTIFICATION_JOB_OPTIONS);
    expect(jobData.templateName).toBe('fee_receipt');
    expect(jobData.header).toEqual({
      type: 'document',
      link: 'https://s3/receipt_FEE-1.pdf',
      filename: 'receipt_FEE-1.pdf'
    });
    expect(Object.keys(jobData.named)).toHaveLength(10);
  });

  it('rejects fee.receipt when the document header is missing (nothing queued)', async () => {
    const res = await queueTemplateNotification('fee.receipt', { to: '8899582239', params: FEE_PARAMS });
    expect(res.queued).toBe(false);
    expect(res.reason).toMatch(/requires a document header/);
    expect(addMock).not.toHaveBeenCalled();
    expect(sendTemplateMock).not.toHaveBeenCalled();
  });

  it('report.card sync fallback passes templateHeader to sendWhatsAppTemplate', async () => {
    redisState.status = 'end';
    await queueTemplateNotification('report.card', {
      to: '8899582239',
      params: NAME,
      dedupeKey: 'report-card:e1:s1',
      headerDocument: { link: 'https://s3/rc.pdf', filename: 'report_card_ADM1.pdf' }
    });
    expect(sendTemplateMock).toHaveBeenCalledWith(
      '8899582239',
      'report_card_notice',
      'en',
      NAME,
      { dedupeKey: 'report-card:e1:s1', templateHeader: { type: 'document', link: 'https://s3/rc.pdf', filename: 'report_card_ADM1.pdf' } }
    );
  });
});

const INSTALLMENT = {
  installment_no_en: '2', amount_en: '2,500', student_name_en: 'Aarav Patel', due_date_en: '10 September 2026',
  installment_no_te: '2', amount_te: '2,500', student_name_te: 'Aarav Patel', due_date_te: '10 September 2026'
};

describe('queueTemplateNotification — installment templates (no header, 8 params)', () => {
  it('enqueues installment.reminder → installment_reminder with all 8 named params', async () => {
    const res = await queueTemplateNotification('installment.reminder', {
      to: '8899582239',
      params: INSTALLMENT,
      dedupeKey: 'installment.reminder:stu1:2:2026-09-10:2026-09-06'
    });
    expect(res).toEqual({ queued: true });
    const [jobName, jobData] = addMock.mock.calls[0];
    expect(jobName).toBe('sendWhatsAppTemplate');
    expect(jobData.templateName).toBe('installment_reminder');
    expect(jobData.languageCode).toBe('en');
    expect(jobData.header).toBeUndefined();
    expect(Object.keys(jobData.named).sort()).toEqual(Object.keys(INSTALLMENT).sort());
  });

  it('enqueues installment.overdue → installment_overdue', async () => {
    await queueTemplateNotification('installment.overdue', { to: '8899582239', params: INSTALLMENT });
    expect(addMock.mock.calls[0][1].templateName).toBe('installment_overdue');
  });

  it('rejects installment.reminder with a missing param (nothing queued)', async () => {
    const { due_date_te, ...rest } = INSTALLMENT;
    const res = await queueTemplateNotification('installment.reminder', { to: '8899582239', params: rest });
    expect(res.queued).toBe(false);
    expect(res.reason).toMatch(/due_date_te/);
    expect(addMock).not.toHaveBeenCalled();
  });
});

describe('queueTemplateNotification — announcement + event templates', () => {
  it('enqueues announcement.broadcast → announcement_broadcast { custom }', async () => {
    const res = await queueTemplateNotification('announcement.broadcast', {
      to: '8899582239',
      params: { custom: 'School reopens Monday.' },
      dedupeKey: 'announcement.broadcast:abc123:918899582239'
    });
    expect(res).toEqual({ queued: true });
    const [, jobData] = addMock.mock.calls[0];
    expect(jobData.templateName).toBe('announcement_broadcast');
    expect(jobData.named).toEqual({ custom: 'School reopens Monday.' });
    expect(jobData.header).toBeUndefined();
  });

  it('enqueues event.announcement → event_announcement with 3 params', async () => {
    const res = await queueTemplateNotification('event.announcement', {
      to: '8899582239',
      params: { event_title: 'Sports Day', event_date: '20 September 2026', event_description: 'Annual sports day.' },
      dedupeKey: 'event.announcement:evt1:918899582239'
    });
    expect(res).toEqual({ queued: true });
    const [, jobData] = addMock.mock.calls[0];
    expect(jobData.templateName).toBe('event_announcement');
    expect(jobData.named).toEqual({
      event_title: 'Sports Day', event_date: '20 September 2026', event_description: 'Annual sports day.'
    });
  });

  it('rejects announcement.broadcast with an empty custom param', async () => {
    const res = await queueTemplateNotification('announcement.broadcast', { to: '8899582239', params: { custom: '   ' } });
    expect(res.queued).toBe(false);
    expect(res.reason).toMatch(/custom/);
    expect(addMock).not.toHaveBeenCalled();
  });
});
