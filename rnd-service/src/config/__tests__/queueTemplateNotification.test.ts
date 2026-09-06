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
