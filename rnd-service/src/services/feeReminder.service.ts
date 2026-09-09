/**
 * ONE common fee-reminder calculation + dispatch flow, shared by:
 *   - the individual "🚀" WhatsApp button        (POST /api/dashboard/send-reminder, one studentId)
 *   - Bulk Send → Send Immediately               (POST /api/dashboard/send-reminder, studentIds[])
 *   - Bulk Send → Schedule for Later              (scheduler → ScheduledAlert.kind === 'feeReminder')
 *
 * Every path resolves the same 6 named params for the approved `installment_reminder`
 * Meta template (registry key `fee.general_reminder`) and queues exactly ONE
 * template message per student (never one per fee, never free-form text).
 *
 *   fee_type selection → label:
 *     school / tuition → School Fee            / పాఠశాల ఫీజు
 *     transport / bus  → Bus Fee               / బస్ ఫీజు
 *     books            → Books Fee             / పుస్తకాల ఫీజు
 *     all              → Total Outstanding Fees / మొత్తం బకాయి ఫీజు  (feePending + transportFee + booksFee)
 */
import { Student } from '../models/student.model';
import { queueTemplateNotification } from '../config/queue';

export type FeeCategory = 'school' | 'transport' | 'books' | 'all';

export const FEE_TYPE_LABELS: Record<FeeCategory, { en: string; te: string }> = {
  school: { en: 'School Fee', te: 'పాఠశాల ఫీజు' },
  transport: { en: 'Bus Fee', te: 'బస్ ఫీజు' },
  books: { en: 'Books Fee', te: 'పుస్తకాల ఫీజు' },
  all: { en: 'Total Outstanding Fees', te: 'మొత్తం బకాయి ఫీజు' }
};

/** Normalise whatever the UI / a stored alert sends into a known FeeCategory (defaults to 'all'). */
export function normalizeFeeCategory(value: unknown): FeeCategory {
  const s = String(value ?? '').trim().toLowerCase();
  if (s === 'school' || s === 'tuition') return 'school';
  if (s === 'transport' || s === 'bus') return 'transport';
  if (s === 'books' || s === 'book') return 'books';
  return 'all';
}

/** Pending amount for the selected category ('all' = total outstanding across all fee heads). */
export function computeFeeAmount(student: any, category: FeeCategory): number {
  const school = Number(student?.feePending) || 0;
  const transport = Number(student?.transportFee) || 0;
  const books = Number(student?.booksFee) || 0;
  if (category === 'school') return Math.max(0, school);
  if (category === 'transport') return Math.max(0, transport);
  if (category === 'books') return Math.max(0, books);
  return Math.max(0, school + transport + books);
}

/** The 6 named params for the approved `fee_general_reminder` template, for one student. */
export function buildFeeReminderParams(student: any, category: FeeCategory): Record<string, string> {
  const name = `${student?.firstName || ''} ${student?.lastName || ''}`.trim() || 'Student';
  const amount = computeFeeAmount(student, category).toLocaleString('en-IN');
  const label = FEE_TYPE_LABELS[category];
  return {
    student_name_en: name,
    fee_type_en: label.en,
    amount_en: amount,
    student_name_te: name,
    fee_type_te: label.te,
    amount_te: amount
  };
}

export interface FeeReminderPerStudent {
  studentId: string;
  name: string;
  amount: number;
  status: 'queued' | 'no_dues' | 'no_phone' | 'rejected' | 'not_found';
  reason?: string;
}

export interface FeeReminderResult {
  requested: number;
  queued: number;
  skippedNoDues: number;
  skippedNoPhone: number;
  rejected: number;
  notFound: number;
  perStudent: FeeReminderPerStudent[];
}

/**
 * Resolve every student's dues for `category` and queue ONE `fee.general_reminder`
 * template per student that actually owes money and has a WhatsApp number.
 * Pure orchestration — no HTTP, reusable by routes and the scheduler.
 */
export async function dispatchFeeReminders(
  studentIds: string[],
  category: FeeCategory
): Promise<FeeReminderResult> {
  const ids = Array.from(new Set((studentIds || []).map((id) => String(id)).filter(Boolean)));
  const result: FeeReminderResult = {
    requested: ids.length,
    queued: 0,
    skippedNoDues: 0,
    skippedNoPhone: 0,
    rejected: 0,
    notFound: 0,
    perStudent: []
  };
  if (ids.length === 0) return result;

  const students = await Student.find({ _id: { $in: ids } });
  const byId = new Map(students.map((s: any) => [String(s._id), s]));
  const today = new Date().toISOString().slice(0, 10);

  for (const id of ids) {
    const student: any = byId.get(id);
    if (!student) {
      result.notFound++;
      result.perStudent.push({ studentId: id, name: '', amount: 0, status: 'not_found' });
      continue;
    }

    const name = `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Student';
    const amount = computeFeeAmount(student, category);

    if (amount <= 0) {
      result.skippedNoDues++;
      result.perStudent.push({ studentId: id, name, amount, status: 'no_dues' });
      continue;
    }
    if (!student.whatsappNo) {
      result.skippedNoPhone++;
      result.perStudent.push({ studentId: id, name, amount, status: 'no_phone' });
      continue;
    }

    const res = await queueTemplateNotification('fee.general_reminder', {
      to: student.whatsappNo,
      params: buildFeeReminderParams(student, category),
      dedupeKey: `fee.general_reminder:${category}:${id}:${today}`
    });

    if (res.queued) {
      result.queued++;
      result.perStudent.push({ studentId: id, name, amount, status: 'queued' });
    } else {
      result.rejected++;
      result.perStudent.push({ studentId: id, name, amount, status: 'rejected', reason: res.reason });
    }
  }

  return result;
}
