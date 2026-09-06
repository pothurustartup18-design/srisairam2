/**
 * Worker-side dispatch: notificationQueue job name -> whatsapp.service call.
 * whatsapp.service is fully mocked — this asserts routing + retry semantics only.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../whatsapp.service', () => ({
  sendWhatsAppAuto: vi.fn().mockResolvedValue(true),
  sendWhatsAppMediaDetailed: vi.fn().mockResolvedValue({ success: true }),
  dispatchResolvedDelivery: vi.fn().mockResolvedValue({ success: true }),
  sendWhatsAppTemplate: vi.fn().mockResolvedValue({ success: true })
}));

import { processNotificationJob } from '../notificationJobHandler';
import {
  sendWhatsAppAuto,
  sendWhatsAppMediaDetailed,
  dispatchResolvedDelivery,
  sendWhatsAppTemplate
} from '../whatsapp.service';

const templateMock = sendWhatsAppTemplate as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  templateMock.mockResolvedValue({ success: true });
});

describe('processNotificationJob — sendWhatsAppTemplate', () => {
  it('routes a template job to sendWhatsAppTemplate with named params + dedupeKey', async () => {
    await processNotificationJob({
      id: 'j1',
      name: 'sendWhatsAppTemplate',
      data: {
        to: '918899582239',
        templateName: 'attendance_alert_full',
        languageCode: 'en',
        named: { student_name_en: 'Harsha', student_name_te: 'Harsha' },
        dedupeKey: 'attendance:2026-09-06:stu1:full'
      }
    });

    expect(templateMock).toHaveBeenCalledWith(
      '918899582239',
      'attendance_alert_full',
      'en',
      { student_name_en: 'Harsha', student_name_te: 'Harsha' },
      { dedupeKey: 'attendance:2026-09-06:stu1:full' }
    );
  });

  it('forwards a document header (fee_receipt) as templateHeader', async () => {
    await processNotificationJob({
      id: 'j3',
      name: 'sendWhatsAppTemplate',
      data: {
        to: '918899582239',
        templateName: 'fee_receipt',
        languageCode: 'en',
        named: { amount_en: '986' },
        dedupeKey: 'fee-receipt:FEE-1',
        header: { type: 'document', link: 'https://s3/r.pdf', filename: 'receipt_FEE-1.pdf' }
      }
    });
    expect(templateMock).toHaveBeenCalledWith(
      '918899582239',
      'fee_receipt',
      'en',
      { amount_en: '986' },
      {
        dedupeKey: 'fee-receipt:FEE-1',
        templateHeader: { type: 'document', link: 'https://s3/r.pdf', filename: 'receipt_FEE-1.pdf' }
      }
    );
  });

  it('THROWS (BullMQ retries) for a TRANSIENT failure (retryable !== false)', async () => {
    templateMock.mockResolvedValueOnce({
      success: false,
      error: { retryable: true, httpStatus: 500, reason: 'HTTP 500 Meta server error' }
    });
    await expect(
      processNotificationJob({
        id: 'j2',
        name: 'sendWhatsAppTemplate',
        data: { to: '918899582239', templateName: 'attendance_alert_full', languageCode: 'en', named: {} }
      })
    ).rejects.toThrow(/transient/i);
  });

  it('does NOT throw (no retry loop) for a PERMANENT template error (retryable === false)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    templateMock.mockResolvedValueOnce({
      success: false,
      error: {
        retryable: false,
        httpStatus: 400,
        code: 132001,
        subcode: 2494010,
        title: 'Template does not exist',
        message: 'template name does not exist in the translation',
        reason: 'Template does not exist or is not approved in this language'
      }
    });
    await expect(
      processNotificationJob({
        id: 'j-perm',
        name: 'sendWhatsAppTemplate',
        data: { to: '918899582239', templateName: 'installment_reminder', languageCode: 'en', named: {} }
      })
    ).resolves.toBeUndefined(); // completes — NOT retried

    const logged = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toMatch(/PERMANENT WhatsApp failure — NOT retrying/);
    expect(logged).toMatch(/installment_reminder/);
    expect(logged).toMatch(/132001/);
    expect(logged).toMatch(/918899582239/);
    errSpy.mockRestore();
  });

  it('media + resolved jobs also respect the permanent/transient split', async () => {
    const mediaMock = sendWhatsAppMediaDetailed as unknown as ReturnType<typeof vi.fn>;
    const resolvedMock = dispatchResolvedDelivery as unknown as ReturnType<typeof vi.fn>;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mediaMock.mockResolvedValueOnce({ success: false, error: { retryable: false, reason: '131052 media' } });
    await expect(
      processNotificationJob({ id: 'm2', name: 'sendWhatsAppMedia', data: { to: '91x', mediaUrl: 'u', type: 'document' } })
    ).resolves.toBeUndefined();

    resolvedMock.mockResolvedValueOnce({ success: false, error: { retryable: true, reason: 'network' } });
    await expect(
      processNotificationJob({ id: 'r2', name: 'sendWhatsAppResolved', data: { to: '91x', resolved: { mode: 'text', text: 't' } } })
    ).rejects.toThrow(/transient/i);
  });
});

describe('processNotificationJob — existing job types still route correctly', () => {
  it('sendWhatsAppText -> sendWhatsAppAuto', async () => {
    await processNotificationJob({ id: 't', name: 'sendWhatsAppText', data: { to: '91x', text: 'hi' } });
    expect(sendWhatsAppAuto).toHaveBeenCalledWith('91x', 'hi');
    expect(templateMock).not.toHaveBeenCalled();
  });

  it('sendWhatsAppMedia -> sendWhatsAppMediaDetailed', async () => {
    await processNotificationJob({
      id: 'm',
      name: 'sendWhatsAppMedia',
      data: { to: '91x', mediaUrl: 'u', type: 'image', filename: undefined, caption: 'c' }
    });
    expect(sendWhatsAppMediaDetailed).toHaveBeenCalledWith('91x', 'u', 'image', undefined, 'c');
  });

  it('sendWhatsAppResolved -> dispatchResolvedDelivery', async () => {
    await processNotificationJob({
      id: 'r',
      name: 'sendWhatsAppResolved',
      data: { to: '91x', resolved: { mode: 'text', text: 't' } }
    });
    expect(dispatchResolvedDelivery).toHaveBeenCalledWith('91x', { mode: 'text', text: 't' });
  });
});
