/**
 * transportAlert.service — cluster transport alert via transport_bus_alert.
 * Student / SchoolProfile / queue are mocked; no Mongo, no Redis, no Graph.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../config/queue', () => ({
  queueTemplateNotification: vi.fn().mockResolvedValue({ queued: true })
}));
vi.mock('../../models/student.model', () => ({ Student: { find: vi.fn() } }));
vi.mock('../../models/schoolProfile.model', () => ({ SchoolProfile: { findOne: vi.fn() } }));

import { dispatchTransportAlert, sanitizeTransportMessage } from '../transportAlert.service';
import { queueTemplateNotification } from '../../config/queue';
import { Student } from '../../models/student.model';
import { SchoolProfile } from '../../models/schoolProfile.model';

const qtn = queueTemplateNotification as unknown as ReturnType<typeof vi.fn>;
const studentFind = Student.find as unknown as ReturnType<typeof vi.fn>;
const profileFindOne = SchoolProfile.findOne as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  qtn.mockResolvedValue({ queued: true });
  profileFindOne.mockResolvedValue({ schoolInfo: { schoolName: 'Sri Sai Ram School' } });
});

describe('sanitizeTransportMessage', () => {
  it('flattens newlines, tabs and runs of spaces — Meta rejects them in a template param (132018)', () => {
    expect(sanitizeTransportMessage('Bus is late.\n\nPlease wait\tat   the stop.')).toBe('Bus is late. Please wait at the stop.');
  });

  it('returns "" for empty / whitespace-only / missing input', () => {
    expect(sanitizeTransportMessage('  \n ')).toBe('');
    expect(sanitizeTransportMessage(undefined)).toBe('');
  });
});

describe('dispatchTransportAlert', () => {
  it('sends transport.alert with message + school_name to each parent number', async () => {
    studentFind.mockResolvedValue([{ whatsappNo: '8899582239', fatherWhatsappNo: '9876543102' }]);

    const res = await dispatchTransportAlert('Madhapur', 'Bus is 15 minutes late.');

    expect(qtn).toHaveBeenCalledTimes(2);
    for (const [key, data] of qtn.mock.calls) {
      expect(key).toBe('transport.alert');
      expect(data.params).toEqual({ message: 'Bus is 15 minutes late.', school_name: 'Sri Sai Ram School' });
    }
    expect(res).toEqual({ studentsInCluster: 1, uniquePhoneNumbers: 2, messagesSent: 2, messagesFailed: 0 });
  });

  it('sends ONE message when the same parent number is stored in different formats', async () => {
    studentFind.mockResolvedValue([
      { whatsappNo: '8899582239', motherWhatsappNo: '+91 88995 82239' },
      { whatsappNo: '918899582239' }
    ]);

    const res = await dispatchTransportAlert('Madhapur', 'Bus is late.');

    expect(qtn).toHaveBeenCalledTimes(1);
    expect(qtn.mock.calls[0][1].to).toBe('918899582239');
    expect(res.uniquePhoneNumbers).toBe(1);
  });

  it('skips missing/invalid numbers instead of sending to them', async () => {
    studentFind.mockResolvedValue([{ whatsappNo: '8899582239', fatherWhatsappNo: '', motherWhatsappNo: '123' }]);
    await dispatchTransportAlert('Madhapur', 'x');
    expect(qtn).toHaveBeenCalledTimes(1);
  });

  it('counts numbers the queue refuses as failed', async () => {
    studentFind.mockResolvedValue([{ whatsappNo: '8899582239', fatherWhatsappNo: '9876543102' }]);
    qtn.mockResolvedValueOnce({ queued: true }).mockResolvedValueOnce({ queued: false, reason: 'boom' });
    const res = await dispatchTransportAlert('Madhapur', 'x');
    expect(res.messagesSent).toBe(1);
    expect(res.messagesFailed).toBe(1);
  });

  it('matches the cluster literally — regex characters in a name are escaped', async () => {
    studentFind.mockResolvedValue([]);
    await dispatchTransportAlert('Area (North)', 'x');
    expect(studentFind.mock.calls[0][0]).toEqual({ cluster: { $regex: '^Area \\(North\\)$', $options: 'i' } });
  });

  it('falls back to "School" when no school name is configured (template params cannot be blank)', async () => {
    profileFindOne.mockResolvedValue(null);
    studentFind.mockResolvedValue([{ whatsappNo: '8899582239' }]);
    await dispatchTransportAlert('Madhapur', 'x');
    expect(qtn.mock.calls[0][1].params.school_name).toBe('School');
  });

  it('uses a stable dedupeKey so a double-clicked Send does not message parents twice', async () => {
    studentFind.mockResolvedValue([{ whatsappNo: '8899582239' }]);
    await dispatchTransportAlert('Madhapur', 'Bus is late.');
    await dispatchTransportAlert('Madhapur', 'Bus is late.');
    expect(qtn.mock.calls[0][1].dedupeKey).toBe(qtn.mock.calls[1][1].dedupeKey);
  });
});
