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

  it('throws (so BullMQ retries) when the template send fails', async () => {
    templateMock.mockResolvedValueOnce({ success: false, error: { reason: 'template paused' } });
    await expect(
      processNotificationJob({
        id: 'j2',
        name: 'sendWhatsAppTemplate',
        data: { to: '918899582239', templateName: 'attendance_alert_full', languageCode: 'en', named: {} }
      })
    ).rejects.toThrow(/template paused/);
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
