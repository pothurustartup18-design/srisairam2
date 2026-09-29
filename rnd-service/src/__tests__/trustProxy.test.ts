/**
 * server.ts sits behind nginx (proxy_pass http://127.0.0.1:5000) and calls
 * app.set('trust proxy', 1) so req.ip reflects the real visitor, not nginx's
 * own loopback connection. This is what the login rate limiter, audit log,
 * and session IP records all read via req.ip — this test isolates just the
 * Express behavior they all depend on, against a real server on a real port.
 */
import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

let server: Server | undefined;
afterEach(() => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())));

async function ipOf(trustProxy: boolean, forwardedFor: string): Promise<string> {
  const app = express();
  if (trustProxy) app.set('trust proxy', 1);
  app.get('/', (req, res) => { res.json({ ip: req.ip }); });
  server = app.listen(0);
  await new Promise((r) => server!.once('listening', r));
  const port = (server!.address() as AddressInfo).port;
  const res = await fetch(`http://127.0.0.1:${port}/`, { headers: { 'X-Forwarded-For': forwardedFor } });
  return (await res.json()).ip;
}

describe('trust proxy (server.ts app.set)', () => {
  it('without it (the bug): every visitor resolves to the loopback socket address, not their real IP', async () => {
    const ip = await ipOf(false, '203.0.113.42');
    expect(ip).not.toBe('203.0.113.42');
    expect(ip).toMatch(/127\.0\.0\.1|::1|::ffff:127\.0\.0\.1/);
  });

  it('with it (the fix): resolves to the real visitor IP from X-Forwarded-For', async () => {
    const ip = await ipOf(true, '203.0.113.42');
    expect(ip).toBe('203.0.113.42');
  });

  it('two different visitors get two different IPs once trusted — this is what gives each visitor their own rate-limit bucket', async () => {
    expect(await ipOf(true, '203.0.113.1')).not.toBe(await ipOf(true, '203.0.113.2'));
  });
});
