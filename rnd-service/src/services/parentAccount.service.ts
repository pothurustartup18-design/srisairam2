import bcrypt from 'bcryptjs';
import { User, IUser } from '../models/user.model';
import { Student } from '../models/student.model';

/**
 * Parent login accounts.
 *
 * Every student gets one parent login:
 *   username = admission number (lower-cased, e.g. "2026-0057")
 *   initial password = student's primary WhatsApp number
 * Until the parent sets their own password, they may ALSO sign in with the
 * student's date of birth (DDMMYYYY) or the primary number — see
 * `matchesInitialCredential`. Setting a password (passwordChangedAt) turns
 * both shortcuts off.
 */

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const last10 = (v: unknown) => digits(v).slice(-10);

function dobDigits(dob: unknown): string | null {
  if (!dob) return null;
  const d = new Date(dob as any);
  if (isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}${pad(d.getUTCMonth() + 1)}${d.getUTCFullYear()}`;
}

/**
 * True when `candidate` is one of the parent's initial credentials (student's
 * primary number or date of birth) and the parent has not yet set a password
 * of their own. Always false for non-parents.
 */
export async function matchesInitialCredential(user: IUser, candidate: string): Promise<boolean> {
  if (user.role !== 'parent' || !user.studentId || user.passwordChangedAt) return false;
  const attempt = digits(candidate);
  if (!attempt) return false;
  const student = await Student.findById(user.studentId).select('whatsappNo dateOfBirth').lean();
  if (!student) return false;
  if (attempt.length >= 10 && last10(attempt) === last10(student.whatsappNo)) return true;
  const dob = dobDigits(student.dateOfBirth);
  return !!dob && attempt === dob;
}

/** Creates the parent login for a student if there isn't one yet. Idempotent. */
export async function ensureParentLogin(student: {
  _id: any; admissionNo: string; firstName: string; lastName?: string; whatsappNo: string;
}): Promise<{ created: boolean; username: string }> {
  const username = String(student.admissionNo).trim().toLowerCase();
  const existing = await User.findOne({ $or: [{ studentId: student._id, role: 'parent' }, { username }] }).select('_id');
  if (existing) return { created: false, username };

  await User.create({
    username,
    password: student.whatsappNo,
    email: `${username}@schoolhub.com`,
    role: 'parent',
    studentId: student._id,
    firstName: 'Parent of',
    lastName: `${student.firstName} ${student.lastName || ''}`.trim(),
    phone: student.whatsappNo,
    isActive: true,
    mustChangePassword: true,
  });
  return { created: true, username };
}

/**
 * Keeps the parent login's phone in step when the student's primary number is
 * edited. If the parent hasn't set their own password yet, the stored initial
 * password is moved to the new number too (hash written directly so the
 * pre-save hook doesn't mark the password as "changed").
 */
export async function syncParentPhone(studentId: any, whatsappNo: string): Promise<void> {
  const parent = await User.findOne({ studentId, role: 'parent' }).select('+password passwordChangedAt');
  if (!parent) return;
  const set: Record<string, unknown> = { phone: whatsappNo };
  if (!parent.passwordChangedAt) set.password = await bcrypt.hash(whatsappNo, 12);
  await User.updateOne({ _id: parent._id }, { $set: set });
}

/** Removes the parent login (and its sessions) when a student is deleted. */
export async function removeParentLogin(studentId: any): Promise<void> {
  const parents = await User.find({ studentId, role: 'parent' }).select('_id');
  if (!parents.length) return;
  const ids = parents.map(p => p._id);
  try {
    const { RefreshToken } = await import('../models/refreshToken.model');
    await RefreshToken.deleteMany({ userId: { $in: ids } });
  } catch { /* sessions expire on their own */ }
  await User.deleteMany({ _id: { $in: ids } });
}
