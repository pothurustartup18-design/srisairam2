import { describe, it, expect } from 'vitest';
import { classifySendError, computeBackoffMs, REENGAGEMENT_ERROR_CODE } from '../whatsapp.service';

const metaError = (code: number, extra: Record<string, unknown> = {}) => ({
  error: { message: 'x', type: 'OAuthException', code, ...extra }
});

describe('classifySendError', () => {
  it('marks network errors retryable', () => {
    const result = classifySendError(undefined, undefined, new Error('fetch failed'));
    expect(result.retryable).toBe(true);
  });

  it('marks HTTP 429 retryable', () => {
    expect(classifySendError(429, metaError(613)).retryable).toBe(true);
  });

  it('marks HTTP 5xx retryable', () => {
    expect(classifySendError(500, undefined).retryable).toBe(true);
    expect(classifySendError(503, undefined).retryable).toBe(true);
  });

  it('marks Meta transient codes retryable (rate limits, overload)', () => {
    for (const code of [1, 2, 4, 80007, 130429, 131016, 131056]) {
      expect(classifySendError(400, metaError(code)).retryable, `code ${code}`).toBe(true);
    }
  });

  it('respects is_transient flag', () => {
    expect(classifySendError(400, metaError(999999, { is_transient: true })).retryable).toBe(true);
  });

  it('never retries permanent failures: bad token, permissions, bad number, bad template', () => {
    for (const code of [0, 10, 100, 190, 131026, 132001, 132000, 133010, 368]) {
      const result = classifySendError(code === 190 ? 401 : 400, metaError(code));
      expect(result.retryable, `code ${code}`).toBe(false);
      expect(result.reason.length).toBeGreaterThan(5); // has a human-readable hint
    }
  });

  it('treats re-engagement (131047) as permanent — handled by template fallback, not retry', () => {
    const result = classifySendError(400, metaError(REENGAGEMENT_ERROR_CODE));
    expect(result.retryable).toBe(false);
    expect(result.code).toBe(131047);
  });

  it('extracts code, subcode and message details', () => {
    const result = classifySendError(400, {
      error: { message: 'Invalid parameter', code: 100, error_subcode: 33, error_user_msg: 'Bad phone' }
    });
    expect(result.code).toBe(100);
    expect(result.subcode).toBe(33);
    expect(result.message).toBe('Bad phone');
  });
});

describe('computeBackoffMs', () => {
  it('grows exponentially with attempt and stays within cap', () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const ms = computeBackoffMs(attempt);
      expect(ms).toBeGreaterThanOrEqual(500 * Math.pow(2, Math.min(attempt, 4)) / 2);
      expect(ms).toBeLessThanOrEqual(30000);
    }
  });

  it('honors Retry-After when longer than computed backoff', () => {
    const ms = computeBackoffMs(0, 45);
    expect(ms).toBeGreaterThanOrEqual(45000);
    expect(ms).toBeLessThanOrEqual(60000);
  });
});
