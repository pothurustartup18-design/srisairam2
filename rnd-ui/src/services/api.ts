import { API_BASE } from '../constants';

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
      const actualInit = init || {};
      
      // Ensure credentials (cookies) are sent for refresh/session management
      actualInit.credentials = 'include';
      
      // Add authorization header if token is present
      const headers = new Headers(actualInit.headers || {});
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      actualInit.headers = headers;

      try {
        let response = await originalFetch(input, actualInit);

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
          if (!isRefreshing) {
            isRefreshing = true;

            try {
              // Call token refresh API
              const refreshResponse = await originalFetch(`${API_BASE}/auth/refresh`, {
                method: 'POST',
                credentials: 'include'
              });

              if (refreshResponse.ok) {
                const refreshData = await refreshResponse.json();
                if (refreshData.success && refreshData.accessToken) {
                  setAccessToken(refreshData.accessToken);
                  isRefreshing = false;
                  onRefreshed(refreshData.accessToken);
                } else {
                  throw new Error('Refresh failed');
                }
              } else {
                throw new Error('Refresh response not OK');
              }
            } catch (err) {
              // Refresh failed, log user out
              isRefreshing = false;
              setAccessToken(null);
              onRefreshFailed(response);
              onLogoutCallback();
              return response; // Return original 401
            }
          }

          // Queue this request until refresh is complete
          return new Promise<Response>((resolve) => {
            refreshSubscribers.push({
              resolve,
              retry: (newToken: string) => {
                const retryInit = { ...actualInit, credentials: 'include' as RequestCredentials };
                const retryHeaders = new Headers(retryInit.headers || {});
                retryHeaders.set('Authorization', `Bearer ${newToken}`);
                retryInit.headers = retryHeaders;
                resolve(originalFetch(input, retryInit));
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
