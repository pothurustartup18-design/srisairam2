import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The fetch interceptor in services/api.ts adds the access token and, on a 401,
 * refreshes the session once and retries. The module captures window.fetch at
 * import time, so each test installs a fake browser environment and re-imports.
 */

const BASE = 'http://test.local/api';
const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface Call { url: string; auth: string | null; signal?: AbortSignal | null }

async function setup(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), auth: new Headers(init?.headers).get('Authorization'), signal: init?.signal };
    calls.push(call);
    return handler(call);
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('location', { origin: 'http://test.local' });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.resetModules();
  const api = await import('../api');
  const onLogout = vi.fn();
  api.setupFetchInterceptor(onLogout);
  api.setAccessToken('old-access');
  return { calls, onLogout, api };
}

const isRefresh = (c: Call) => c.url.endsWith('/auth/refresh');

describe('fetch interceptor', () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.unstubAllGlobals());

  it('adds the access token to API calls', async () => {
    const { calls } = await setup(() => json(200, { ok: true }));
    await window.fetch(`${BASE}/students`);
    expect(calls[0].auth).toBe('Bearer old-access');
  });

  it('refreshes once on a 401 and RETRIES the request that triggered it', async () => {
    const { calls, onLogout } = await setup(c => {
      if (isRefresh(c)) return json(200, { success: true, accessToken: 'new-access' });
      return c.auth === 'Bearer new-access' ? json(200, { data: 'ok' }) : json(401);
    });

    const res = await window.fetch(`${BASE}/students`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: 'ok' });
    expect(calls.map(c => (isRefresh(c) ? 'refresh' : c.auth))).toEqual(['Bearer old-access', 'refresh', 'Bearer new-access']);
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('shares one refresh between simultaneous 401s and retries every request', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const { calls } = await setup(async c => {
      if (isRefresh(c)) {
        await gate;
        return json(200, { success: true, accessToken: 'new-access' });
      }
      return c.auth === 'Bearer new-access' ? json(200, { url: c.url }) : json(401);
    });

    const requests = [window.fetch(`${BASE}/a`), window.fetch(`${BASE}/b`), window.fetch(`${BASE}/c`)];
    await new Promise(r => setTimeout(r, 20));
    release();
    const responses = await Promise.all(requests);

    expect(responses.map(r => r.status)).toEqual([200, 200, 200]);
    expect(calls.filter(isRefresh)).toHaveLength(1);
  });

  it('signs the user out when the server rejects the session', async () => {
    const { onLogout } = await setup(c => (isRefresh(c) ? json(401, { success: false }) : json(401)));
    const res = await window.fetch(`${BASE}/students`);
    expect(res.status).toBe(401);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('keeps the user signed in when the refresh fails only because the network is down', async () => {
    const { onLogout, api } = await setup(c => {
      if (isRefresh(c)) throw new TypeError('Failed to fetch');
      return json(401);
    });
    const res = await window.fetch(`${BASE}/students`);
    expect(res.status).toBe(401);
    expect(onLogout).not.toHaveBeenCalled();
    expect(api.getAccessToken()).toBe('old-access');
  });

  it('does not try to refresh when a login attempt returns 401', async () => {
    const { calls } = await setup(() => json(401, { success: false }));
    await window.fetch(`${BASE}/auth/login`, { method: 'POST' });
    expect(calls.filter(isRefresh)).toHaveLength(0);
  });

  it('passes non-API requests straight through', async () => {
    const { calls } = await setup(() => json(200));
    await window.fetch('http://cdn.test/image.png');
    expect(calls[0].auth).toBeNull();
  });

  it('fails a read that gets no response in 30s with a TimeoutError', async () => {
    vi.useFakeTimers();
    const { calls } = await setup((c) => new Promise<Response>((_, reject) => {
      c.signal?.addEventListener('abort', () => reject(c.signal!.reason));
    }));
    const pending = window.fetch(`${BASE}/students`);
    const outcome = pending.then(() => 'resolved', (e: DOMException) => e.name);
    await vi.advanceTimersByTimeAsync(29_000);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(await outcome).toBe('TimeoutError');
  });

  it('never puts a time limit on writes or uploads', async () => {
    const { calls } = await setup(() => json(200, { success: true }));
    await window.fetch(`${BASE}/students`, { method: 'POST', body: '{}' });
    expect(calls[0].signal ?? null).toBeNull();
  });

  it('stops the timer once headers arrive so slow downloads can finish', async () => {
    vi.useFakeTimers();
    let aborted = false;
    await setup((c) => {
      c.signal?.addEventListener('abort', () => { aborted = true; });
      return json(200, { success: true });
    });
    await window.fetch(`${BASE}/backup/students`);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(aborted).toBe(false);
  });

  it('still honours a caller abort signal on reads', async () => {
    const { calls } = await setup((c) => new Promise<Response>((_, reject) => {
      c.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const ctrl = new AbortController();
    const outcome = window.fetch(`${BASE}/students`, { signal: ctrl.signal }).then(() => 'resolved', (e: DOMException) => e.name);
    ctrl.abort();
    expect(await outcome).toBe('AbortError');
    expect(calls).toHaveLength(1);
  });
});
