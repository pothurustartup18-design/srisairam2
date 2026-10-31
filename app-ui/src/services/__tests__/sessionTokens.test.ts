import { describe, expect, it, vi } from 'vitest';
import { nativeHeaders, refreshSession, type TokenStore } from '../sessionTokens';

const API = 'http://api.test/api';

function memoryStore(initial: string | null = null): TokenStore & { value: string | null } {
  const s = {
    value: initial,
    async get() { return s.value; },
    async set(t: string) { s.value = t; },
    async clear() { s.value = null; }
  };
  return s;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('refreshSession: installed app', () => {
  it('does nothing when no session is stored (fresh install / cleared data)', async () => {
    const fetchMock = vi.fn();
    const out = await refreshSession(fetchMock as any, API, { native: true, store: memoryStore(null) });
    expect(out).toEqual({ ok: false, definitive: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the stored token in the body with the app marker, and keeps the rotated token', async () => {
    const store = memoryStore('old-token');
    const fetchMock = vi.fn(async () => json(200, { success: true, accessToken: 'access-1', refreshToken: 'new-token' }));
    const out = await refreshSession(fetchMock as any, API, { native: true, store });

    expect(out).toEqual({ ok: true, accessToken: 'access-1' });
    expect(store.value).toBe('new-token');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API}/auth/refresh`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-Client']).toBe('native-app');
    expect(JSON.parse(init.body as string)).toEqual({ refreshToken: 'old-token' });
  });

  it('clears the saved session when the server rejects it (revoked/expired)', async () => {
    for (const status of [401, 403]) {
      const store = memoryStore('t');
      const out = await refreshSession((async () => json(status, { success: false })) as any, API, { native: true, store });
      expect(out).toEqual({ ok: false, definitive: true });
      expect(store.value).toBeNull();
    }
  });

  it('keeps the saved session on a server error', async () => {
    const store = memoryStore('t');
    const out = await refreshSession((async () => json(500, { success: false })) as any, API, { native: true, store });
    expect(out).toEqual({ ok: false, definitive: false });
    expect(store.value).toBe('t');
  });

  it('keeps the saved session when offline', async () => {
    const store = memoryStore('t');
    const out = await refreshSession((async () => { throw new TypeError('Failed to fetch'); }) as any, API, { native: true, store });
    expect(out).toEqual({ ok: false, definitive: false });
    expect(store.value).toBe('t');
  });

  it('treats a malformed success response as a non-definitive failure and keeps the session', async () => {
    const store = memoryStore('t');
    const out = await refreshSession((async () => json(200, { success: true })) as any, API, { native: true, store });
    expect(out).toEqual({ ok: false, definitive: false });
    expect(store.value).toBe('t');
  });

  it('does not overwrite the stored token when the response has none', async () => {
    const store = memoryStore('t');
    await refreshSession((async () => json(200, { success: true, accessToken: 'a' })) as any, API, { native: true, store });
    expect(store.value).toBe('t');
  });
});

describe('refreshSession: browser', () => {
  it('relies on the cookie: no body, no app marker, never touches storage', async () => {
    const store = memoryStore('should-not-be-used');
    const fetchMock = vi.fn(async () => json(200, { success: true, accessToken: 'web-access', refreshToken: 'ignored' }));
    const out = await refreshSession(fetchMock as any, API, { native: false, store });

    expect(out).toEqual({ ok: true, accessToken: 'web-access' });
    expect(store.value).toBe('should-not-be-used');
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)['X-Client']).toBeUndefined();
  });

  it('does not clear anything on a 401', async () => {
    const store = memoryStore('keep');
    const out = await refreshSession((async () => json(401, {})) as any, API, { native: false, store });
    expect(out).toEqual({ ok: false, definitive: true });
    expect(store.value).toBe('keep');
  });
});

describe('refreshSession: concurrency', () => {
  it('shares one request between simultaneous callers (refresh tokens rotate)', async () => {
    const store = memoryStore('t');
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const fetchMock = vi.fn(async () => {
      await gate;
      return json(200, { success: true, accessToken: 'a', refreshToken: 'r2' });
    });
    const first = refreshSession(fetchMock as any, API, { native: true, store });
    const second = refreshSession(fetchMock as any, API, { native: true, store });
    release();
    expect(await first).toEqual({ ok: true, accessToken: 'a' });
    expect(await second).toEqual({ ok: true, accessToken: 'a' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('allows a new refresh once the previous one finished', async () => {
    const store = memoryStore('t');
    const fetchMock = vi.fn(async () => json(200, { success: true, accessToken: 'a', refreshToken: 'r' }));
    await refreshSession(fetchMock as any, API, { native: true, store });
    await refreshSession(fetchMock as any, API, { native: true, store });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('nativeHeaders', () => {
  it('marks only the installed app', () => {
    expect(nativeHeaders(true)).toEqual({ 'X-Client': 'native-app' });
    expect(nativeHeaders(false)).toEqual({});
  });
});
