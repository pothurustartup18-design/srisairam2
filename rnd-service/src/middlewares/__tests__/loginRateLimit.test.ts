/**
 * Login rate limiter must never hang login when Redis is down.
 * Real express server on an ephemeral port; Redis is faked.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { createLoginRateLimiter } from '../loginRateLimit.middleware';

let server: Server | undefined;
afterEach(() => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())));

async function startApp(redis: { status: string; call: (...a: string[]) => Promise<unknown> }) {
  const app = express();
  app.use('/login', createLoginRateLimiter(redis));
  app.post('/login', (_req, res) => { res.status(200).json({ ok: true }); });
  server = app.listen(0);
  await new Promise((r) => server!.once('listening', r));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}/login`;
}

// What ioredis does while disconnected with maxRetriesPerRequest: null —
// the command is queued and its promise never settles.
const neverSettles = () => new Promise<unknown>(() => {});

describe('createLoginRateLimiter', () => {
  it('login still responds when Redis is down (commands would otherwise hang forever)', async () => {
    const redis = { status: 'reconnecting', call: vi.fn(neverSettles) };
    const url = await startApp(redis);

    const res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(3000) });

    expect(res.status).toBe(200);
  });

  it('still throttles brute force while Redis is down (in-memory fallback)', async () => {
    const url = await startApp({ status: 'reconnecting', call: vi.fn(neverSettles) });

    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await fetch(url, { method: 'POST' })).status);

    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });

  it('uses Redis when Redis is ready', async () => {
    const call = vi.fn(async (cmd: string) => (cmd === 'SCRIPT' ? 'fake-sha' : [1, 60000]));
    const url = await startApp({ status: 'ready', call });

    const res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(3000) });

    expect(res.status).toBe(200);
    expect(call.mock.calls.some(([cmd]) => cmd === 'EVALSHA')).toBe(true);
  });
});
