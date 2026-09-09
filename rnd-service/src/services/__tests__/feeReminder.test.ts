/**
 * feeReminder.service — the ONE common fee-reminder calculation + dispatch flow
 * shared by the "🚀" button, Bulk Send, and the scheduler.
 *
 * Student model + queue are mocked; no Mongo, no Redis, no Graph.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../config/queue', () => ({
  queueTemplateNotification: vi.fn().mockResolvedValue({ queued: true })
}));
vi.mock('../../models/student.model', () => ({ Student: { find: vi.fn() } }));

import {
  normalizeFeeCategory,
  computeFeeAmount,
  buildFeeReminderParams,
  dispatchFeeReminders,
  FEE_TYPE_LABELS
} from '../feeReminder.service';
import { queueTemplateNotification } from '../../config/queue';
import { Student } from '../../models/student.model';

const qtn = queueTemplateNotification as unknown as ReturnType<typeof vi.fn>;
const studentFind = Student.find as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  qtn.mockResolvedValue({ queued: true });
});

const stu = (over: Record<string, unknown> = {}) => ({
  _id: 'stu1',
  firstName: 'Aarav',
  lastName: 'Patel',
  whatsappNo: '8899582239',
  feePending: 5000,
  transportFee: 2000,
  booksFee: 1500,
  ...over
});

describe('normalizeFeeCategory', () => {
  it('maps the UI values (incl. tuition/bus aliases) and defaults to "all"', () => {
    expect(normalizeFeeCategory('school')).toBe('school');
    expect(normalizeFeeCategory('tuition')).toBe('school');
    expect(normalizeFeeCategory('transport')).toBe('transport');
    expect(normalizeFeeCategory('bus')).toBe('transport');
    expect(normalizeFeeCategory('books')).toBe('books');
    expect(normalizeFeeCategory('all')).toBe('all');
    expect(normalizeFeeCategory(undefined)).toBe('all');
    expect(normalizeFeeCategory('garbage')).toBe('all');
  });
});

describe('computeFeeAmount', () => {
  it('returns the per-head amount, and "all" = total outstanding across every head', () => {
    const s = stu();
    expect(computeFeeAmount(s, 'school')).toBe(5000);
    expect(computeFeeAmount(s, 'transport')).toBe(2000);
    expect(computeFeeAmount(s, 'books')).toBe(1500);
    expect(computeFeeAmount(s, 'all')).toBe(8500);
  });

  it('treats missing / non-numeric fee fields as 0', () => {
    expect(computeFeeAmount({ feePending: undefined }, 'all')).toBe(0);
    expect(computeFeeAmount({ feePending: 'x', booksFee: 100 }, 'all')).toBe(100);
  });
});

describe('buildFeeReminderParams', () => {
  it('produces the 6 named params with localized fee_type and en-IN amount', () => {
    const p = buildFeeReminderParams(stu(), 'all');
    expect(p).toEqual({
      student_name_en: 'Aarav Patel',
      fee_type_en: 'Total Outstanding Fees',
      amount_en: '8,500',
      student_name_te: 'Aarav Patel',
      fee_type_te: FEE_TYPE_LABELS.all.te,
      amount_te: '8,500'
    });
  });

  it('uses the Bus Fee label for the transport category', () => {
    const p = buildFeeReminderParams(stu(), 'transport');
    expect(p.fee_type_en).toBe('Bus Fee');
    expect(p.fee_type_te).toBe('బస్ ఫీజు');
    expect(p.amount_en).toBe('2,000');
  });
});

describe('dispatchFeeReminders', () => {
  it('queues exactly ONE fee.general_reminder per student with dues (never one per fee)', async () => {
    studentFind.mockResolvedValue([stu({ _id: 'a' }), stu({ _id: 'b' })]);
    const res = await dispatchFeeReminders(['a', 'b'], 'all');

    expect(qtn).toHaveBeenCalledTimes(2);
    expect(res.queued).toBe(2);
    const [key, data] = qtn.mock.calls[0];
    expect(key).toBe('fee.general_reminder');
    expect(data.to).toBe('8899582239');
    expect(data.params.fee_type_en).toBe('Total Outstanding Fees');
    expect(data.dedupeKey).toMatch(/^fee\.general_reminder:all:a:\d{4}-\d{2}-\d{2}$/);
  });

  it('skips students with no dues for the selected category (no send)', async () => {
    studentFind.mockResolvedValue([stu({ _id: 'a', transportFee: 0 })]);
    const res = await dispatchFeeReminders(['a'], 'transport');
    expect(qtn).not.toHaveBeenCalled();
    expect(res.queued).toBe(0);
    expect(res.skippedNoDues).toBe(1);
    expect(res.perStudent[0].status).toBe('no_dues');
  });

  it('skips students without a WhatsApp number', async () => {
    studentFind.mockResolvedValue([stu({ _id: 'a', whatsappNo: '' })]);
    const res = await dispatchFeeReminders(['a'], 'school');
    expect(qtn).not.toHaveBeenCalled();
    expect(res.skippedNoPhone).toBe(1);
  });

  it('counts a queue rejection without throwing', async () => {
    studentFind.mockResolvedValue([stu({ _id: 'a' })]);
    qtn.mockResolvedValueOnce({ queued: false, reason: 'invalid recipient' });
    const res = await dispatchFeeReminders(['a'], 'school');
    expect(res.rejected).toBe(1);
    expect(res.perStudent[0].reason).toBe('invalid recipient');
  });

  it('reports students that were not found', async () => {
    studentFind.mockResolvedValue([]);
    const res = await dispatchFeeReminders(['missing'], 'all');
    expect(res.notFound).toBe(1);
    expect(qtn).not.toHaveBeenCalled();
  });

  it('no-ops on an empty id list', async () => {
    const res = await dispatchFeeReminders([], 'all');
    expect(res.requested).toBe(0);
    expect(studentFind).not.toHaveBeenCalled();
  });
});
