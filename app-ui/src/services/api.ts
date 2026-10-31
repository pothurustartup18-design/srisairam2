import { API_BASE } from '../constants';
import { refreshSession } from './sessionTokens';

/** How long an API read may take before it fails with a TimeoutError. */
const READ_TIMEOUT_MS = 30_000;

let token: string | null = null;
let isRefreshing = false;

interface Subscriber {
  resolve: (value: Response | PromiseLike<Response>) => void;
  retry: (newToken: string) => void;
}

let refreshSubscribers: Subscriber[] = [];

export const setAccessToken = (newToken: string | null) => {
  token = newToken;
};

export const getAccessToken = () => token;

const onRefreshed = (newToken: string) => {
  refreshSubscribers.forEach((sub) => sub.retry(newToken));
  refreshSubscribers = [];
};

const onRefreshFailed = (originalResponse: Response) => {
  refreshSubscribers.forEach((sub) => sub.resolve(originalResponse));
  refreshSubscribers = [];
};

// Store original fetch
const originalFetch = window.fetch;

// Custom fetch interceptor setup
export const setupFetchInterceptor = (onLogoutCallback: () => void) => {
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlString = input.toString();

    // Only intercept requests directed to our API base
    if (urlString.startsWith(API_BASE)) {
      const actualInit: RequestInit = { ...(init || {}) };
      
      // Ensure credentials (cookies) are sent for refresh/session management
      actualInit.credentials = 'include';
      
      // Add authorization header if token is present
      const headers = new Headers(actualInit.headers || {});
      headers.set('Bypass-Tunnel-Reminder', 'true');
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      actualInit.headers = headers;

      // Reads must not hang forever on a dead connection: if the server hasn't
      // started answering in time the request fails with a TimeoutError. The timer
      // stops once headers arrive, so large downloads can still stream. Writes and
      // uploads are left alone so a slow but valid save is never cut off half-way.
      const method = (actualInit.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      let headerTimer: ReturnType<typeof setTimeout> | undefined;
      if (method === 'GET' || method === 'HEAD') {
        const timeoutCtrl = new AbortController();
        headerTimer = setTimeout(
          () => timeoutCtrl.abort(new DOMException('The server took too long to respond.', 'TimeoutError')),
          READ_TIMEOUT_MS,
        );
        const anySignal = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
        if (!actualInit.signal) actualInit.signal = timeoutCtrl.signal;
        else if (anySignal) actualInit.signal = anySignal([actualInit.signal, timeoutCtrl.signal]);
      }

      try {
        let response: Response;
        try {
          response = await originalFetch(input, actualInit);
        } finally {
          clearTimeout(headerTimer);
        }

        // Intercept 401 Unauthorized errors (excluding auth requests to avoid loops)
        if (
          response.status === 401 && 
          !urlString.includes('/auth/login') && 
          !urlString.includes('/auth/refresh') && 
          !urlString.includes('/auth/logout') &&
          !urlString.includes('/auth/forgot-password') &&
          !urlString.includes('/auth/verify-reset-token') &&
          !urlString.includes('/auth/reset-password')
        ) {
          // Re-send a request with a fresh access token.
          const retryWithToken = (newToken: string) => {
            const retryHeaders = new Headers(actualInit.headers || {});
            retryHeaders.set('Authorization', `Bearer ${newToken}`);
            return originalFetch(input, { ...actualInit, credentials: 'include' as RequestCredentials, headers: retryHeaders });
          };

          if (!isRefreshing) {
            isRefreshing = true;

            try {
              // One shared refresh at a time (refresh tokens rotate). The installed app
              // sends its stored token; browsers use the cookie.
              const outcome = await refreshSession(originalFetch, API_BASE);
              if (!outcome.ok) {
                isRefreshing = false;
                onRefreshFailed(response);
                if (outcome.definitive) {
                  // The server rejected the session: sign in again.
                  setAccessToken(null);
                  onLogoutCallback();
                }
                // Otherwise it was only a network problem: keep the saved session and
                // let this request fail; the next one will try to refresh again.
                return response; // Return original 401
              }
              setAccessToken(outcome.accessToken);
              isRefreshing = false;
              onRefreshed(outcome.accessToken); // retries requests that queued meanwhile
              return retryWithToken(outcome.accessToken); // and retry the one that started it
            } catch (err) {
              // Unexpected failure while refreshing, log user out
              isRefreshing = false;
              setAccessToken(null);
              onRefreshFailed(response);
              onLogoutCallback();
              return response; // Return original 401
            }
          }

          // A refresh is already running: wait for it, then retry with the new token
          return new Promise<Response>((resolve) => {
            refreshSubscribers.push({
              resolve,
              retry: (newToken: string) => {
                resolve(retryWithToken(newToken));
              }
            });
          });
        }

        return response;
      } catch (error) {
        // Let network failures propagate so callers can surface a real error to the user
        throw error;
      }
    }

    // Pass-through other fetches (e.g. assets, unsplash images)
    return originalFetch(input, init);
  };
};
