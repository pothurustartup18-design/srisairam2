import type { Request } from 'express';

/**
 * Session lifetime and refresh-token transport rules.
 *
 * Browsers keep the refresh token in an HttpOnly SameSite=strict cookie and
 * stay signed in for 7 days. The installed mobile app (which sends
 * `X-Client: native-app`) runs on its own origin (https://localhost) while the
 * API lives on another site, so the browser engine never stores that cookie.
 * For the app the server therefore also returns the refresh token in the JSON
 * body and accepts it back in the request body, and keeps the user signed in
 * for 30 days of inactivity (the token is rotated and re-extended on every
 * refresh).
 */
export const WEB_SESSION_DAYS = 7;
export const NATIVE_SESSION_DAYS = 30;
const MAX_TOKEN_LENGTH = 2048;

export const isNativeClient = (req: Pick<Request, 'header'>): boolean => req.header('x-client') === 'native-app';

export const sessionDays = (req: Pick<Request, 'header'>): number => (isNativeClient(req) ? NATIVE_SESSION_DAYS : WEB_SESSION_DAYS);

export const sessionSeconds = (days: number): number => days * 24 * 60 * 60;

/** Cookie first (browsers); the body token is honoured only for the native app. */
export const readRefreshToken = (req: Pick<Request, 'header' | 'cookies' | 'body'>): string | undefined => {
  const fromCookie = req.cookies?.refreshToken;
  if (typeof fromCookie === 'string' && fromCookie.length > 0) return fromCookie;
  if (!isNativeClient(req)) return undefined;
  const fromBody = req.body?.refreshToken;
  return typeof fromBody === 'string' && fromBody.length > 0 && fromBody.length <= MAX_TOKEN_LENGTH ? fromBody : undefined;
};
