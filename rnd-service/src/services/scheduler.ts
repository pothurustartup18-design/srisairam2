import { ScheduledAlert } from '../models/scheduledAlert.model';
import { Student } from '../models/student.model';
import { Teacher } from '../models/teacher.model';
import { sendWhatsAppText, resolveWhatsAppDelivery, dispatchResolvedDelivery, OutgoingAttachment } from './whatsapp.service';
import { getMediaType, extractS3Key, getS3ObjectSize } from './s3.service';
import { renderTemplate } from './template.service';
import { queueNotification } from '../config/queue';

// Optional audience filters for broadcasts (empty/undefined = everyone)
export interface BroadcastFilters {
  classes?: string[];
  sections?: string[];
  studentIds?: string[];
}

// True when the teacher is assigned to any of the filtered classes
// (assignedClass is a comma list of room codes like "10-A, 10-B")
const teacherMatchesFilters = (assignedClass: string, filters?: BroadcastFilters): boolean => {
  if (!filters?.classes?.length) return true;
  const classSet = new Set(filters.classes.map(c => c.trim().toUpperCase()));
  return assignedClass
    .split(',')
    .map(room => room.trim().toUpperCase().split('-')[0])
    .some(cls => classSet.has(cls));
};

// Actual broadcast execution logic (also used for immediate event alerts)
export const executeAlertBroadcast = async (
  title: string,
  message: string,
  sendAlertsTo: 'parents' | 'teachers' | 'both',
  mediaUrl?: string,
  mediaUrls?: string[],
  filters?: BroadcastFilters
) => {
  try {
    let recipients: string[] = [];

    if (sendAlertsTo === 'parents' || sendAlertsTo === 'both') {
      if (filters?.studentIds?.length) {
        const students = await Student.find({ _id: { $in: filters.studentIds } });
        recipients.push(...students.map(s => s.whatsappNo));
      } else {
        const query: any = {};
        if (filters?.classes?.length) query.class = { $in: filters.classes.map(c => c.trim()) };
        if (filters?.sections?.length) {
          query.section = { $in: filters.sections.map(s => new RegExp(`^${s.trim()}$`, 'i')) };
        }
        const students = await Student.find(query);
        recipients.push(...students.map(s => s.whatsappNo));
      }
    }

    if (sendAlertsTo === 'teachers' || sendAlertsTo === 'both') {
      const teachers = await Teacher.find({});
      recipients.push(
        ...teachers
          .filter(t => teacherMatchesFilters(t.assignedClass || '', filters))
          .map(t => t.phone)
          .filter((p): p is string => !!p)
      );
    }

    // Deduplicate
    recipients = Array.from(new Set(recipients)).filter(Boolean);

    // Normalize media list (supports older scheduled alerts too)
    const urls = mediaUrls && mediaUrls.length > 0 ? mediaUrls : (mediaUrl ? [mediaUrl] : []);
    const attachments: OutgoingAttachment[] = await Promise.all(
      urls.map(async (url): Promise<OutgoingAttachment> => {
        const s3Key = extractS3Key(url);
        const size = s3Key ? await getS3ObjectSize(s3Key) : null;
        return { url, type: getMediaType(url), size: size ?? undefined };
      })
    );

    console.log(`[Scheduler] Broadcasting alert: "${title}" to ${recipients.length} recipients...`);

    // Resolved ONCE for the whole broadcast — with 2+ event photos/videos (or any
    // single file over Meta's per-type cap) this uploads one shared gallery page
    // rather than re-uploading it once per recipient.
    const resolved = await resolveWhatsAppDelivery(message, attachments);

    for (const phone of recipients) {
      await dispatchResolvedDelivery(phone, resolved);
    }
  } catch (error) {
    console.error('[Scheduler] Error executing scheduled broadcast:', error);
  }
};

// ─── Fee Installment Reminders ────────────────────────────────────────────────

const REMINDER_LOOKAHEAD_MS = 3 * 24 * 60 * 60 * 1000; // remind 3 days before due date
const REMINDER_REPEAT_MS = 3 * 24 * 60 * 60 * 1000; // repeat at most every 3 days
const REMINDER_SWEEP_HOUR = 9; // run daily after 9 AM server time

/**
 * Marks past-due unpaid installments as overdue and sends WhatsApp reminders
 * for installments due within the next 3 days (or already overdue).
 * Reminders repeat at most once every 3 days per installment.
 */
export const runInstallmentReminderSweep = async (): Promise<{ remindersSent: number; markedOverdue: number }> => {
  const result = { remindersSent: 0, markedOverdue: 0 };
  const now = new Date();
  const lookahead = new Date(now.getTime() + REMINDER_LOOKAHEAD_MS);

  const students = await Student.find({ 'installments.status': { $in: ['unpaid', 'overdue'] } });
  for (const student of students) {
    let changed = false;
    for (const installment of student.installments) {
      if (installment.status === 'paid') continue;

      if (installment.status === 'unpaid' && installment.dueDate < now) {
        installment.status = 'overdue';
        changed = true;
        result.markedOverdue++;
      }

      const isDueSoonOrOverdue = installment.dueDate <= lookahead;
      const lastSent = installment.reminderSentAt;
      const repeatAllowed = !lastSent || now.getTime() - new Date(lastSent).getTime() > REMINDER_REPEAT_MS;

      if (isDueSoonOrOverdue && repeatAllowed && student.whatsappNo) {
        const templateKey = installment.dueDate < now ? 'installmentOverdue' : 'installmentReminder';
        const reminderMsg = await renderTemplate(templateKey, student.preferredLanguage, {
          studentName: `${student.firstName} ${student.lastName}`,
          installmentNo: String(installment.installmentNo),
          amount: installment.amount.toLocaleString(),
          dueDate: new Date(installment.dueDate).toLocaleDateString()
        });
        await queueNotification('sendWhatsAppText', { to: student.whatsappNo, text: reminderMsg });
        installment.reminderSentAt = now;
        changed = true;
        result.remindersSent++;
      }
    }
    if (changed) await student.save();
  }

  if (result.remindersSent > 0 || result.markedOverdue > 0) {
    console.log(`[Scheduler] Installment sweep: ${result.remindersSent} reminder(s) sent, ${result.markedOverdue} installment(s) marked overdue.`);
  }
  return result;
};

// Database Polling Scheduler loop
export const startDatabaseScheduler = () => {
  console.log('[Scheduler] Background database scheduler loop initialized.');

  setInterval(async () => {
    try {
      const now = new Date();
      
      // Process pending alerts one at a time using atomic updates.
      // This distributed lock prevents multiple backend processes in PM2 cluster mode
      // from fetching and broadcasting the same alert concurrently.
      let hasMorePending = true;
      while (hasMorePending) {
        const alert = await ScheduledAlert.findOneAndUpdate(
          {
            scheduledAt: { $lte: now },
            status: 'pending'
          },
          {
            $set: { status: 'sending' }
          },
          {
            new: true
          }
        );

        if (!alert) {
          hasMorePending = false;
          break;
        }

        console.log(`[Scheduler] Processing alert: "${alert.title}" (ID: ${alert._id})`);

        // Perform broadcast
        await executeAlertBroadcast(alert.title, alert.message, alert.sendAlertsTo, alert.mediaUrl, alert.mediaUrls, {
          classes: alert.classes,
          sections: alert.sections,
          studentIds: alert.studentIds
        });

        // Mark as sent
        alert.status = 'sent';
        await alert.save();
      }
    } catch (error) {
      console.error('[Scheduler] Error in database scheduler tick:', error);
    }
  }, 10000); // Check every 10 seconds

  // Daily fee installment reminder sweep (runs once per day after 9 AM)
  let lastSweepDay = '';
  setInterval(async () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    if (now.getHours() < REMINDER_SWEEP_HOUR || lastSweepDay === today) return;
    lastSweepDay = today;
    try {
      await runInstallmentReminderSweep();
    } catch (error) {
      console.error('[Scheduler] Error in installment reminder sweep:', error);
    }
  }, 30 * 60 * 1000); // Check every 30 minutes
};
