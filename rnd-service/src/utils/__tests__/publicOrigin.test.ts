import { describe, it, expect, afterEach } from 'vitest';
import { getPublicOrigin } from '../publicOrigin';

const req = (headers: Record<string, string>, protocol = 'http') =>
  ({ protocol, get: (h: string) => headers[h.toLowerCase()] }) as any;

describe('getPublicOrigin', () => {
  const originalAppHost = process.env.APP_HOST;
  afterEach(() => { process.env.APP_HOST = originalAppHost; });

  it('production: nginx Host + X-Forwarded-Proto win over a stale localhost APP_HOST', () => {
    process.env.APP_HOST = 'localhost:5173';
    const origin = getPublicOrigin(req({ host: '18-61-239-173.sslip.io', 'x-forwarded-proto': 'https' }));
    expect(origin).toBe('https://18-61-239-173.sslip.io');
    expect(origin).not.toMatch(/localhost/);
  });

  it('prefers X-Forwarded-Host over Host', () => {
    expect(getPublicOrigin(req({ host: '127.0.0.1:5000', 'x-forwarded-host': 'erp.example.com', 'x-forwarded-proto': 'https' })))
      .toBe('https://erp.example.com');
  });

  it('takes the first value of a comma-separated forwarded proto', () => {
    expect(getPublicOrigin(req({ host: 'erp.example.com', 'x-forwarded-proto': 'https, http' })))
      .toBe('https://erp.example.com');
  });

  it('falls back to req.protocol when no forwarded proto is set (local dev)', () => {
    expect(getPublicOrigin(req({ host: 'localhost:5000' }, 'http'))).toBe('http://localhost:5000');
  });
});
