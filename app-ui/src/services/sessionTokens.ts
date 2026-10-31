import { Preferences } from '@capacitor/preferences';
import { isNativeApp } from '../constants';

/**
 * Keeps the installed mobile app signed in.
 *
 * Why this exists: the server keeps your session in a SameSite=strict cookie,
 * but the app runs on its own origin (https://localhost) and the API is on
 * another site, so Android's WebView never stores that cookie. The server
 * therefore hands the app its refresh token in the response and the app keeps
 * it in Capacitor Preferences (private app storage: it survives app and live
 * updates and is erased only by uninstalling or "Clear data"). The password
 * itself is never stored.
 *
 * Browsers are unaffected: they keep using the HttpOnly cookie.
 */

const TOKEN_KEY = 'schoolhub.refreshToken';
const REFRESH_TIMEOUT_MS = 10000;

export interface TokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

export const preferencesStore: TokenStore = {
  async get() {
    try {
      return (await Preferences.get({ key: TOKEN_KEY })).value ?? null;
    } catch {
      return null;
    }
  },
  async set(token) {
    await Preferences.set({ key: TOKEN_KEY, value: token });
  },
  async clear() {
    try {
      await Preferences.remove({ key: TOKEN_KEY });
    } catch {
      /* nothing stored */
    }
  }
};

/** Marks requests as coming from the app so the server uses the 30-day, body-token flow. */
export const nativeHeaders = (native: boolean = isNativeApp): Record<string, string> => (native ? { 'X-Client': 'native-app' } : {});

export type RefreshOutcome =
  | { ok: true; accessToken: string }
  // definitive: the server rejected the session (sign in again). Otherwise it was a
  // network problem and the stored session is kept for the next attempt.
  | { ok: false; definitive: boolean };

let inflight: Promise<RefreshOutcome> | null = null;

/**
 * Exchanges the stored session for a new access token. Refresh tokens rotate,
 * so only one request may run at a time: concurrent callers share it.
 */
export function refreshSession(
  fetchImpl: typeof fetch,
  apiBase: string,
  opts: { native?: boolean; store?: TokenStore } = {}
): Promise<RefreshOutcome> {
  if (inflight) return inflight;
  inflight = doRefresh(fetchImpl, apiBase, opts.native ?? isNativeApp, opts.store ?? preferencesStore).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doRefresh(fetchImpl: typeof fetch, apiBase: string, native: boolean, store: TokenStore): Promise<RefreshOutcome> {
  const headers: Record<string, string> = { ...nativeHeaders(native) };
  let body: string | undefined;
  if (native) {
    const token = await store.get();
    if (!token) return { ok: false, definitive: true }; // never signed in on this install
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({ refreshToken: token });
  }

  let res: Response;
  try {
    res = await fetchImpl(`${apiBase}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body,
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS)
    });
  } catch {
    return { ok: false, definitive: false };
  }

  if (!res.ok) {
    const definitive = res.status === 401 || res.status === 403;
    if (definitive && native) await store.clear();
    return { ok: false, definitive };
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    return { ok: false, definitive: false };
  }
  if (!data?.success || typeof data.accessToken !== 'string') return { ok: false, definitive: false };
  if (native && typeof data.refreshToken === 'string') await store.set(data.refreshToken);
  return { ok: true, accessToken: data.accessToken };
}

export const saveRefreshToken = (token: string, store: TokenStore = preferencesStore) => store.set(token);
export const getRefreshToken = (store: TokenStore = preferencesStore) => store.get();
export const clearRefreshToken = (store: TokenStore = preferencesStore) => store.clear();
