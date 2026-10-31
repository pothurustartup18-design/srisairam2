import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.REDIS_PORT = '6399';
});

import Module from 'node:module';
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import passport from 'passport';
import type { AddressInfo } from 'net';

/**
 * Parent password-change OTP, end to end through the real routes against a real
 * MongoDB. Opt-in: set TEST_MONGODB_URI to a THROWAWAY database (the suite
 * drops it). WhatsApp dispatch is replaced by a capture so the code can be read.
 */
const TEST_DB = process.env.TEST_MONGODB_URI;

const sent = vi.hoisted(() => ({ calls: [] as any[], queued: true }));
vi.mock('../../../config/queue', () => ({
  queueTemplateNotification: vi.fn(async (_tpl: string, payload: any) => {
    sent.calls.push(payload);
    return sent.queued ? { queued: true } : { queued: false, reason: 'test' };
  })
}));

const nodeLoad = (Module as any)._load;
(Module as any)._load = function (request: string, ...rest: any[]) {
  if (request === '../config/redis') return { default: { status: 'end' } };
  return nodeLoad.call(this, request, ...rest);
};

let base = '';
let server: any;
let User: any;
let OTP: any;
let svc: any;

const PW = 'Parent-pw-1';
const call = (method: string, path: string, token?: string, body?: any) =>
  fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
const login = async (username: string, password = PW) =>
  (await (await call('POST', '/api/auth/login', undefined, { username, password })).json()).accessToken as string;
const lastCode = () => sent.calls[sent.calls.length - 1].params.code as string;
const expireCooldown = () => OTP.updateMany({}, { $set: { createdAt: new Date(Date.now() - 120_000) } });

describe.skipIf(!TEST_DB)('parent password-change OTP (integration)', { timeout: 60_000 }, () => {
  beforeAll(async () => {
    await mongoose.connect(TEST_DB!);
    await mongoose.connection.db!.dropDatabase();
    await import('../../../config/passport');
    User = (await import('../../../models/user.model')).User;
    OTP = (await import('../../../models/passwordChangeOTP.model')).PasswordChangeOTP;
    svc = await import('../../../services/passwordChangeOtp.service');
    const mk = (username: string, role: string, extra: any = {}) =>
      User.create({ username, password: PW, role, firstName: 'T', lastName: username, phone: '9876543210', isActive: true, ...extra });
    await mk('otp-parent', 'parent');
    await mk('otp-parent2', 'parent');
    await mk('otp-parent3', 'parent');
    await mk('otp-parent-forced', 'parent', { mustChangePassword: true });
    await mk('otp-admin', 'admin', { email: 'otp-admin@example.com' });
    await OTP.init();

    const authRoutes = (await import('../../shared/auth.routes')).default;
    const profileRoutes = (await import('../profile.routes')).default;
    const { authenticateJWT } = await import('../../../middlewares/auth.middleware');
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(passport.initialize());
    app.use('/api/auth', authRoutes);
    app.use('/api/parent/profile', authenticateJWT, profileRoutes);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise(r => server?.close(r));
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    sent.calls.length = 0;
    sent.queued = true;
    await OTP.deleteMany({});
  });

  it('requires authentication and the parent role to request an OTP', async () => {
    expect((await call('POST', '/api/parent/profile/send-password-otp')).status).toBe(401);
    const adminToken = await login('otp-admin');
    expect((await call('POST', '/api/parent/profile/send-password-otp', adminToken)).status).toBe(403);
    expect(sent.calls).toHaveLength(0);
  });

  it('sends the code over WhatsApp only: never in the response, stored only hashed', async () => {
    const token = await login('otp-parent');
    const res = await call('POST', '/api/parent/profile/send-password-otp', token);
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(sent.calls).toHaveLength(1);
    expect(text).not.toContain(lastCode());
    expect(JSON.parse(text).otpCode).toBeUndefined();
    const doc = await OTP.findOne({}).lean();
    expect(JSON.stringify(doc)).not.toContain(lastCode());
    expect(doc.purpose).toBe('parent-password-change');
    expect(doc.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(doc.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000 + 1000);
  });

  it('enforces a resend cooldown and discards the code when WhatsApp cannot send it', async () => {
    const token = await login('otp-parent');
    expect((await call('POST', '/api/parent/profile/send-password-otp', token)).status).toBe(200);
    const again = await call('POST', '/api/parent/profile/send-password-otp', token);
    expect(again.status).toBe(429);
    expect(again.headers.get('retry-after')).toBeTruthy();
    await OTP.deleteMany({});
    sent.queued = false;
    expect((await call('POST', '/api/parent/profile/send-password-otp', token)).status).toBe(503);
    expect(await OTP.countDocuments({})).toBe(0);
  });

  it('changes the password only with a valid OTP, and the OTP is single-use', async () => {
    const token = await login('otp-parent');
    const newPw = 'Brand-new-pw-2';
    const noOtp = await call('POST', '/api/auth/change-password', token, { currentPassword: PW, newPassword: newPw });
    expect(noOtp.status).toBe(400);
    expect(await login('otp-parent', newPw)).toBeUndefined();

    await call('POST', '/api/parent/profile/send-password-otp', token);
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    const bad = await call('POST', '/api/auth/change-password', token, { currentPassword: PW, newPassword: newPw, otpCode: wrong });
    expect(bad.status).toBe(400);

    const ok = await call('POST', '/api/auth/change-password', token, { currentPassword: PW, newPassword: newPw, otpCode: code });
    expect(ok.status).toBe(200);
    expect(await login('otp-parent', newPw)).toBeTruthy();

    const reuse = await call('POST', '/api/auth/change-password', token, { currentPassword: newPw, newPassword: 'Another-pw-3', otpCode: code });
    expect(reuse.status).toBe(400);
  });

  it('does not burn the OTP when the current password is wrong', async () => {
    const token = await login('otp-parent2');
    await call('POST', '/api/parent/profile/send-password-otp', token);
    const code = lastCode();
    const res = await call('POST', '/api/auth/change-password', token, { currentPassword: 'wrong-pw-xx', newPassword: 'Brand-new-pw-2', otpCode: code });
    expect(res.status).toBe(400);
    expect(await OTP.countDocuments({})).toBe(1);
    expect((await OTP.findOne({}).lean()).attempts).toBe(0);
  });

  it('locks the code after 5 wrong guesses, even if the right one is then supplied', async () => {
    const token = await login('otp-parent2');
    await call('POST', '/api/parent/profile/send-password-otp', token);
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const r = await call('POST', '/api/auth/change-password', token, { currentPassword: PW, newPassword: 'Brand-new-pw-2', otpCode: wrong });
      expect(r.status).toBe(400);
    }
    const r = await call('POST', '/api/auth/change-password', token, { currentPassword: PW, newPassword: 'Brand-new-pw-2', otpCode: code });
    expect(r.status).toBe(400);
    expect((await r.json()).message).toMatch(/Too many/);
    expect(await login('otp-parent2', 'Brand-new-pw-2')).toBeUndefined();
  });

  it('rejects an expired code', async () => {
    const token = await login('otp-parent2');
    await call('POST', '/api/parent/profile/send-password-otp', token);
    const code = lastCode();
    await OTP.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await call('POST', '/api/auth/change-password', token, { currentPassword: PW, newPassword: 'Brand-new-pw-2', otpCode: code });
    expect(r.status).toBe(400);
  });

  it('a code issued to one parent is useless for another account', async () => {
    const a = await login('otp-parent3');
    const b = await login('otp-parent2');
    await call('POST', '/api/parent/profile/send-password-otp', a);
    const codeA = lastCode();
    await expireCooldown();
    await call('POST', '/api/parent/profile/send-password-otp', b);
    const codeB = lastCode();
    const r = await call('POST', '/api/auth/change-password', b, { currentPassword: PW, newPassword: 'Brand-new-pw-2', otpCode: codeA });
    if (codeA !== codeB) expect(r.status).toBe(400);
  });

  it('keeps the forced first-login change and other roles on the current-password-only flow', async () => {
    const forced = await login('otp-parent-forced');
    const r1 = await call('POST', '/api/auth/change-password', forced, { currentPassword: PW, newPassword: 'Forced-new-pw-4' });
    expect(r1.status).toBe(200);
    const admin = await login('otp-admin');
    const r2 = await call('POST', '/api/auth/change-password', admin, { currentPassword: PW, newPassword: 'Admin-new-pw-5' });
    expect(r2.status).toBe(200);
  });

  it('service: verify without a live code reports missing and malformed input is rejected', async () => {
    const u = await User.findOne({ username: 'otp-parent' });
    expect((await svc.verifyAndConsumePasswordChangeOtp(u._id, '123456')).ok).toBe(false);
    expect((await svc.verifyAndConsumePasswordChangeOtp(u._id, { $ne: 1 })).ok).toBe(false);
  });
});
