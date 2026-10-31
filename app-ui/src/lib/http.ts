/**
 * Small helpers for reading API responses consistently.
 * Every endpoint answers `{ success, data?, message? }`; these turn a failed
 * HTTP status or `success: false` into a thrown ApiError so callers can't
 * mistake a failure for an empty result.
 */

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Parses a JSON response, throwing ApiError when the request did not succeed. */
export async function readJson<T = any>(res: Response): Promise<T> {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON body (proxy error page, empty 204…)
  }
  if (!res.ok || (body && body.success === false)) {
    const message = typeof body?.message === 'string' && body.message.length < 300 ? body.message : '';
    throw new ApiError(message || `Request failed (${res.status})`, res.status);
  }
  return body as T;
}

/** GETs an API URL and returns its `data` field. */
export async function getData<T = any>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const body = await readJson<{ data: T }>(res);
  return body?.data as T;
}

export const isAbortError = (err: unknown) =>
  err instanceof DOMException && err.name === 'AbortError';

/** A short, user-safe description of why a request failed. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return 'The server took too long to respond. Please try again.';
  }
  if (err instanceof ApiError) {
    if (err.status === 403) return 'You don’t have permission to view this.';
    if (err.status >= 500) return 'The server ran into a problem. Please try again.';
    return err.message || fallback;
  }
  if (err instanceof TypeError) return 'Can’t reach the server. Check your connection and try again.';
  return fallback;
}
