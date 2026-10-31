import { API_BASE } from '../constants';

export class ApiError extends Error {
  status: number;
  payload: any;

  constructor(message: string, status: number, payload: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

interface RequestOptions {
  params?: Record<string, string | number | boolean | undefined>;
}

const buildUrl = (path: string, params?: RequestOptions['params']) => {
  const url = `${API_BASE}${path}`;
  if (!params) return url;
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) query.set(key, String(value));
  });
  const queryString = query.toString();
  return queryString ? `${url}?${queryString}` : url;
};

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  options?: RequestOptions
): Promise<T> {
  const url = buildUrl(path, options?.params);
  const init: RequestInit = { method };

  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  // Goes through window.fetch so the auth-header/401-refresh interceptor
  // installed by setupFetchInterceptor (services/api.ts) still applies.
  const response = await window.fetch(url, init);
  const payload = await response.json().catch(() => null);

  if (!payload || payload.success === false) {
    const message = payload?.message || payload?.error || 'Request failed';
    throw new ApiError(message, response.status, payload);
  }

  return payload.data as T;
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PUT', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PATCH', path, body, options),
  del: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, undefined, options),
};
