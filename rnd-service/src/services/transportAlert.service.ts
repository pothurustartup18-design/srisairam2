import crypto from 'crypto';
import { Student } from '../models/student.model';
import { SchoolProfile } from '../models/schoolProfile.model';
import { queueTemplateNotification } from '../config/queue';
import { normalizePhone } from './whatsapp.service';

// transport_bus_alert's fixed body is ~90 chars; Meta caps the whole body at 1024.
export const TRANSPORT_MESSAGE_MAX_LENGTH = 900;

// Meta rejects a template param containing newlines, tabs or 4+ consecutive
// spaces (HTTP 400, code 132018) — and admins type this message in a textarea.
export function sanitizeTransportMessage(raw: unknown): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface TransportAlertResult {
  studentsInCluster: number;
  uniquePhoneNumbers: number;
  messagesSent: number;
  messagesFailed: number;
}

// Sends the approved transport_bus_alert template to every parent number of
// every student in the cluster.
export async function dispatchTransportAlert(cluster: string, message: string): Promise<TransportAlertResult> {
  const students: any[] = await Student.find({ cluster: { $regex: `^${escapeRegex(cluster)}$`, $options: 'i' } });

  // Dedupe on the normalized number: "8899582239" and "+918899582239" are the
  // same parent and must get one message, not two.
  const phones = new Set<string>();
  for (const s of students) {
    for (const raw of [s.whatsappNo, s.fatherWhatsappNo, s.motherWhatsappNo]) {
      const norm = normalizePhone(raw);
      if (norm.ok && norm.e164) phones.add(norm.e164);
    }
  }

  const profile: any = await SchoolProfile.findOne();
  const schoolName = sanitizeTransportMessage(profile?.schoolInfo?.schoolName) || 'School';
  const salt = crypto.createHash('sha256').update(`${cluster}\n${message}`).digest('hex').slice(0, 12);

  let messagesSent = 0;
  let messagesFailed = 0;
  for (const phone of phones) {
    const result = await queueTemplateNotification('transport.alert', {
      to: phone,
      params: { message, school_name: schoolName },
      dedupeKey: `transport.alert:${salt}:${phone}`
    });
    if (result.queued) messagesSent++;
    else messagesFailed++;
  }

  return { studentsInCluster: students.length, uniquePhoneNumbers: phones.size, messagesSent, messagesFailed };
}
