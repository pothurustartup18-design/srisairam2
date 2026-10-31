import { describe, expect, it } from 'vitest';
import { ApiError, errorMessage, readJson } from '../http';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('readJson', () => {
  it('returns the body of a successful response', async () => {
    await expect(readJson(json(200, { success: true, data: [1, 2] }))).resolves.toEqual({ success: true, data: [1, 2] });
  });

  it('throws on an HTTP error, keeping the server message and status', async () => {
    const err = await readJson(json(400, { success: false, message: 'Subject is required' })).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.message).toBe('Subject is required');
  });

  it('throws when a 200 response says success: false', async () => {
    await expect(readJson(json(200, { success: false, message: 'Nope' }))).rejects.toThrow('Nope');
  });

  it('throws for a non-JSON error page instead of returning garbage', async () => {
    const err = await readJson(new Response('<html>Bad gateway</html>', { status: 502 })).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(502);
  });
});

describe('errorMessage', () => {
  it('explains timeouts', () => {
    expect(errorMessage(new DOMException('x', 'TimeoutError'))).toMatch(/took too long/);
  });

  it('explains network failures without leaking details', () => {
    expect(errorMessage(new TypeError('Failed to fetch'))).toMatch(/Can’t reach the server/);
  });

  it('hides server internals on 5xx', () => {
    expect(errorMessage(new ApiError('MongoServerError: E11000 at db.students', 500))).not.toMatch(/Mongo/);
  });

  it('uses the API message for client errors and the fallback otherwise', () => {
    expect(errorMessage(new ApiError('Invalid OTP', 400))).toBe('Invalid OTP');
    expect(errorMessage(new Error('boom'), 'Fallback')).toBe('Fallback');
  });
});
