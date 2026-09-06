/**
 * Scheduler → approved-template wiring:
 *  - runInstallmentReminderSweep → installment.reminder / installment.overdue
 *  - executeAlertBroadcast(template) → per-recipient queueTemplateNotification
 *    (announcement.broadcast / event.announcement), NOT sendWhatsAppResolved
 *
 * Models + queue are mocked; no Mongo, no Redis, no Graph.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../config/queue', () => ({
  queueTemplateNotification: vi.fn().mockResolvedValue({ queued: true })
}));
vi.mock('../../models/student.model', () => ({ Student: { find: vi.fn() } }));
vi.mock('../../models/teacher.model', () => ({ Teacher: { find: vi.fn() } }));
vi.mock('../../models/scheduledAlert.model', () => ({ ScheduledAlert: { findOneAndUpdate: vi.fn() } }));

import { runInstallmentReminderSweep, executeAlertBroadcast } from '../scheduler';
import { queueTemplateNotification } from '../../config/queue';
import { Student } from '../../models/student.model';
import { Teacher } from '../../models/teacher.model';

const qtn = queueTemplateNotification as unknown as ReturnType<typeof vi.fn>;
const studentFind = Student.find as unknown as ReturnType<typeof vi.fn>;
const teacherFind = Teacher.find as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runInstallmentReminderSweep → approved installment templates', () => {
  it('queues installment.reminder for an upcoming installment with all 8 named params', async () => {
    const inFourDays = new Date(Date.now() + 2 * 24 * 3600 * 1000); // within 3-day lookahead
    const save = vi.fn().mockResolvedValue(undefined);
    studentFind.mockResolvedValue([
      {
        _id: 'stu1',
        firstName: 'Aarav',
        lastName: 'Patel',
        whatsappNo: '8899582239',
        installments: [{ installmentNo: 2, amount: 2500, dueDate: inFourDays, status: 'unpaid', reminderSentAt: undefined }],
        save
      }
    ]);

    const res = await runInstallmentReminderSweep();
    expect(res.remindersSent).toBe(1);
    expect(qtn).toHaveBeenCalledTimes(1);
    const [key, data] = qtn.mock.calls[0];
    expect(key).toBe('installment.reminder');
    expect(data.to).toBe('8899582239');
    expect(data.params).toEqual({
      installment_no_en: '2', amount_en: '2,500', student_name_en: 'Aarav Patel', due_date_en: expect.any(String),
      installment_no_te: '2', amount_te: '2,500', student_name_te: 'Aarav Patel', due_date_te: expect.any(String)
    });
    expect(data.params.due_date_en).toBe(data.params.due_date_te);
    expect(data.dedupeKey).toMatch(/^installment\.reminder:stu1:2:/);
    expect(save).toHaveBeenCalled();
  });

  it('queues installment.overdue for a past-due installment and marks it overdue', async () => {
    const pastDue = new Date(Date.now() - 5 * 24 * 3600 * 1000);
    const inst = { installmentNo: 1, amount: 1000, dueDate: pastDue, status: 'unpaid', reminderSentAt: undefined };
    studentFind.mockResolvedValue([
      { _id: 's2', firstName: 'Ravi', lastName: 'K', whatsappNo: '8899582239', installments: [inst], save: vi.fn() }
    ]);

    const res = await runInstallmentReminderSweep();
    expect(res.markedOverdue).toBe(1);
    expect(inst.status).toBe('overdue');
    expect(qtn.mock.calls[0][0]).toBe('installment.overdue');
  });

  it('respects the 3-day repeat throttle (reminderSentAt recent → nothing queued)', async () => {
    const soon = new Date(Date.now() + 24 * 3600 * 1000);
    studentFind.mockResolvedValue([
      {
        _id: 's3',
        firstName: 'A',
        lastName: 'B',
        whatsappNo: '8899582239',
        installments: [{ installmentNo: 1, amount: 500, dueDate: soon, status: 'unpaid', reminderSentAt: new Date() }],
        save: vi.fn()
      }
    ]);
    const res = await runInstallmentReminderSweep();
    expect(res.remindersSent).toBe(0);
    expect(qtn).not.toHaveBeenCalled();
  });
});

describe('executeAlertBroadcast(template) → per-recipient queueTemplateNotification', () => {
  it('announcement.broadcast: one template job per parent, no free-form send', async () => {
    studentFind.mockResolvedValue([{ whatsappNo: '8899582239' }, { whatsappNo: '9876543210' }]);
    teacherFind.mockResolvedValue([]);

    await executeAlertBroadcast('Holiday', 'School closed tomorrow.', 'parents', undefined, [], { classes: [], sections: [] }, {
      key: 'announcement.broadcast',
      params: { custom: 'School closed tomorrow.' },
      dedupeSalt: 'evt-abc'
    });

    expect(qtn).toHaveBeenCalledTimes(2);
    for (const call of qtn.mock.calls) {
      expect(call[0]).toBe('announcement.broadcast');
      expect(call[1].params).toEqual({ custom: 'School closed tomorrow.' });
      expect(call[1].dedupeKey).toMatch(/^announcement\.broadcast:evt-abc:91/);
    }
  });

  it('event.announcement: template job per recipient; media attachments are skipped (text-only template)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    studentFind.mockResolvedValue([{ whatsappNo: '8899582239' }]);
    teacherFind.mockResolvedValue([]);

    await executeAlertBroadcast(
      'Sports Day',
      'legacy msg',
      'parents',
      'https://s3/photo.jpg',
      ['https://s3/photo.jpg'],
      { classes: [], sections: [] },
      { key: 'event.announcement', params: { event_title: 'Sports Day', event_date: '20 September 2026', event_description: 'Fun.' }, dedupeSalt: 'evt1' }
    );

    expect(qtn).toHaveBeenCalledTimes(1);
    expect(qtn.mock.calls[0][0]).toBe('event.announcement');
    expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/media attachment\(s\) NOT sent/);
    warn.mockRestore();
  });

  it('WITHOUT a template descriptor → BLOCKED (nothing queued, nothing sent free-form)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    studentFind.mockResolvedValue([{ whatsappNo: '8899582239' }]);
    teacherFind.mockResolvedValue([]);
    await executeAlertBroadcast('X', 'plain', 'parents', undefined, [], { classes: [], sections: [] });
    expect(qtn).not.toHaveBeenCalled();
    expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/BLOCKED: broadcast "X" has no approved WhatsApp template/);
    warn.mockRestore();
  });
});
