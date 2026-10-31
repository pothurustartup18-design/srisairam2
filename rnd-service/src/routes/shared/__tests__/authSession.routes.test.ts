import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Never let this test reach a real Redis (other projects use the default port): the
// controllers then fall back to the MongoDB refresh-token store.
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
 * Real login / refresh / logout through the auth routes against a real MongoDB:
 * the installed app gets a 30-day session it stores itself, browsers keep the
 * 7-day cookie flow. Opt-in: set TEST_MONGODB_URI to a THROWAWAY database
 * (the suite drops it). Never point this at production.
 */
const TEST_DB = process.env.TEST_MONGODB_URI;

// auth.controller loads Redis with a runtime require('../config/redis'), which the test runner
// cannot resolve (it is TypeScript). Hand it a "not connected" client: the controller then uses its
// MongoDB refresh-token fallback, exactly as it does when Redis is down.
const nodeLoad = (Module as any)._load;
(Module as any)._load = function (request: string, ...rest: any[]) {
  if (request === '../config/redis') return { default: { status: 'end' } };
  return nodeLoad.call(this, request, ...rest);
};
const DAY = 24 * 60 * 60 * 1000;

let base = '';
let server: any;
let userId: any;

const post = (path: string, opts: { app?: boolean; body?: any; cookie?: string } = {}) =>
  fetch(`${base}/api/auth${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.app ? { 'X-Client': 'native-app' } : {}),
      ...(opts.cookie ? { Cookie: opts.cookie } : {})
    },
    body: JSON.stringify(opts.body ?? {})
  });

const cookieOf = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const CREDS = { username: 'session-test-admin', password: 'Sup3r-secret-pw' };

describe.skipIf(!TEST_DB)('auth sessions (integration)', () => {
  let RefreshToken: any;

  beforeAll(async () => {
    await mongoose.connect(TEST_DB!);
    await mongoose.connection.db!.dropDatabase();
    await import('../../../config/passport'); // registers the local + jwt strategies
    const { User } = await import('../../../models/user.model');
    RefreshToken = (await import('../../../models/refreshToken.model')).RefreshToken;
    const user: any = await User.create({
      username: CREDS.username,
      password: CREDS.password,
      role: 'admin',
      firstName: 'Session',
      lastName: 'Tester',
      phone: '+919999000011',
      email: 'session-test@example.com',
      isActive: true
    });
    userId = user._id;

    const authRoutes = (await import('../auth.routes')).default;
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(passport.initialize());
    app.use('/api/auth', authRoutes);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise(r => server?.close(r));
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  const latestTokenDoc = () => RefreshToken.findOne({ userId }).sort({ createdAt: -1 });

  it('mobile app login returns a refresh token and keeps the session 30 days', async () => {
    await RefreshToken.deleteMany({});
    const res = await post('/login', { app: true, body: CREDS });
    expect(res.status, await res.clone().text()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.accessToken).toBe('string');
    expect(typeof body.refreshToken).toBe('string');

    const doc = await latestTokenDoc();
    const days = (doc.expiresAt.getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });

  it('browser login keeps the 7-day cookie flow and never exposes the token in the body', async () => {
    await RefreshToken.deleteMany({});
    const res = await post('/login', { body: CREDS });
    expect(res.status, await res.clone().text()).toBe(200);
    const body = await res.json();
    expect(body.refreshToken).toBeUndefined();
    expect(res.headers.get('set-cookie')).toMatch(/^refreshToken=/);
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/i);

    const days = ((await latestTokenDoc()).expiresAt.getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it('rejects a wrong password with no token', async () => {
    const res = await post('/login', { app: true, body: { ...CREDS, password: 'wrong' } });
    expect(res.status).toBe(401);
    expect((await res.json()).refreshToken).toBeUndefined();
  });

  it('app can restore its session from the stored token alone (no cookie), and the token rotates', async () => {
    const login = await (await post('/login', { app: true, body: CREDS })).json();
    await sleep(1100); // a new JWT needs a different issued-at second

    const res = await post('/refresh', { app: true, body: { refreshToken: login.refreshToken } });
    expect(res.status, await res.clone().text()).toBe(200);
    const body = await res.json();
    expect(typeof body.accessToken).toBe('string');
    expect(typeof body.refreshToken).toBe('string');
    expect(body.refreshToken).not.toBe(login.refreshToken);

    // 30 days again from this use (rolling), not what was left of the old one
    const days = ((await latestTokenDoc()).expiresAt.getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(29.9);

    // the old token was consumed; the new one works
    expect((await post('/refresh', { app: true, body: { refreshToken: login.refreshToken } })).status).toBe(401);
    await sleep(1100);
    expect((await post('/refresh', { app: true, body: { refreshToken: body.refreshToken } })).status).toBe(200);
  });

  it('a browser (no app marker) cannot use a body token', async () => {
    const login = await (await post('/login', { app: true, body: CREDS })).json();
    const res = await post('/refresh', { body: { refreshToken: login.refreshToken } });
    expect(res.status).toBe(401);
  });

  it('browsers still refresh from the cookie and get no token in the body', async () => {
    const login = await post('/login', { body: CREDS });
    const cookie = cookieOf(login);
    await sleep(1100);
    const res = await post('/refresh', { cookie });
    expect(res.status, await res.clone().text()).toBe(200);
    const body = await res.json();
    expect(typeof body.accessToken).toBe('string');
    expect(body.refreshToken).toBeUndefined();
  });

  it('logout from the app revokes the stored token on the server', async () => {
    const login = await (await post('/login', { app: true, body: CREDS })).json();
    const out = await post('/logout', { app: true, body: { refreshToken: login.refreshToken } });
    expect(out.status).toBe(200);
    expect((await post('/refresh', { app: true, body: { refreshToken: login.refreshToken } })).status).toBe(401);
  });

  it('rejects garbage, injection objects and missing tokens', async () => {
    for (const refreshToken of ['not-a-jwt', { $ne: null }, 12345, '', undefined]) {
      expect((await post('/refresh', { app: true, body: { refreshToken } })).status).toBe(401);
    }
    expect((await post('/refresh', { app: true })).status).toBe(401);
  });

  it('a deactivated account loses its saved session', async () => {
    const login = await (await post('/login', { app: true, body: CREDS })).json();
    const { User } = await import('../../../models/user.model');
    await User.updateOne({ _id: userId }, { isActive: false });
    expect((await post('/refresh', { app: true, body: { refreshToken: login.refreshToken } })).status).toBe(401);
    await User.updateOne({ _id: userId }, { isActive: true });
  });
});
