import crypto from 'crypto';
import { Types } from 'mongoose';
import { PasswordChangeOTP, PASSWORD_CHANGE_PURPOSE } from '../models/passwordChangeOTP.model';
import { JWT_SECRET } from '../config/secrets';

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

const hashCode = (userId: Types.ObjectId | string, code: string): string =>
  crypto.createHmac('sha256', JWT_SECRET).update(`${PASSWORD_CHANGE_PURPOSE}:${String(userId)}:${code}`).digest('hex');

export type IssueResult =
  | { ok: true; id: string; code: string }
  | { ok: false; retryAfterSeconds: number };

/** Create (replacing any previous) a one-time code bound to this user and purpose. */
export async function issuePasswordChangeOtp(userId: Types.ObjectId | string, phone: string): Promise<IssueResult> {
  const existing = await PasswordChangeOTP.findOne({ userId, purpose: PASSWORD_CHANGE_PURPOSE }).lean();
  if (existing) {
    const wait = new Date(existing.createdAt).getTime() + OTP_RESEND_COOLDOWN_MS - Date.now();
    if (wait > 0) return { ok: false, retryAfterSeconds: Math.ceil(wait / 1000) };
  }
  const code = String(crypto.randomInt(100000, 1000000));
  await PasswordChangeOTP.deleteMany({ userId, purpose: PASSWORD_CHANGE_PURPOSE });
  const doc = await PasswordChangeOTP.create({
    userId,
    purpose: PASSWORD_CHANGE_PURPOSE,
    phone,
    otpHash: hashCode(userId, code),
    expiresAt: new Date(Date.now() + OTP_TTL_MS)
  });
  return { ok: true, id: String(doc._id), code };
}

/** Drop a code that could not be delivered so the user is not left waiting out the cooldown. */
export async function discardPasswordChangeOtp(id: string): Promise<void> {
  await PasswordChangeOTP.deleteOne({ _id: id }).catch(() => {});
}

export type VerifyResult = { ok: true } | { ok: false; reason: 'missing' | 'invalid' | 'locked' };

/**
 * Verify and consume the code. Each call atomically counts an attempt (max
 * OTP_MAX_ATTEMPTS, after which the code is dead); a correct code is deleted
 * atomically, so it can be used exactly once even under concurrent requests.
 */
export async function verifyAndConsumePasswordChangeOtp(userId: Types.ObjectId | string, rawCode: unknown): Promise<VerifyResult> {
  const code = typeof rawCode === 'string' || typeof rawCode === 'number' ? String(rawCode).trim() : '';
  if (!/^\d{6}$/.test(code)) {
    // Malformed input still costs an attempt when a code is live.
    await PasswordChangeOTP.updateOne({ userId, purpose: PASSWORD_CHANGE_PURPOSE, expiresAt: { $gt: new Date() } }, { $inc: { attempts: 1 } });
    return { ok: false, reason: 'invalid' };
  }
  const doc = await PasswordChangeOTP.findOneAndUpdate(
    { userId, purpose: PASSWORD_CHANGE_PURPOSE, expiresAt: { $gt: new Date() }, attempts: { $lt: OTP_MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { new: true }
  );
  if (!doc) {
    const stale = await PasswordChangeOTP.exists({ userId, purpose: PASSWORD_CHANGE_PURPOSE, expiresAt: { $gt: new Date() } });
    return { ok: false, reason: stale ? 'locked' : 'missing' };
  }
  const expected = Buffer.from(doc.otpHash, 'hex');
  const actual = Buffer.from(hashCode(userId, code), 'hex');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return { ok: false, reason: 'invalid' };
  }
  const consumed = await PasswordChangeOTP.findOneAndDelete({ _id: doc._id });
  return consumed ? { ok: true } : { ok: false, reason: 'missing' };
}
