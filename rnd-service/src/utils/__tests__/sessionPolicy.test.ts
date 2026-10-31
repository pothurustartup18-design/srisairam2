import { describe, it, expect } from 'vitest';
import {
  isNativeClient,
  NATIVE_SESSION_DAYS,
  readRefreshToken,
  sessionDays,
  sessionSeconds,
  WEB_SESSION_DAYS
} from '../sessionPolicy';

const req = (headers: Record<string, string> = {}, cookies?: Record<string, any>, body?: any) =>
  ({
    header: (name: string) => headers[name.toLowerCase()],
    cookies,
    body
  }) as any;

describe('session lifetime', () => {
  it('keeps browsers at 7 days and the mobile app at 30 days', () => {
    expect(WEB_SESSION_DAYS).toBe(7);
    expect(NATIVE_SESSION_DAYS).toBe(30);
    expect(sessionDays(req())).toBe(7);
    expect(sessionDays(req({ 'x-client': 'native-app' }))).toBe(30);
  });

  it('only the exact native-app marker counts', () => {
    expect(isNativeClient(req({ 'x-client': 'native-app' }))).toBe(true);
    expect(isNativeClient(req({ 'x-client': 'Native-App' }))).toBe(false);
    expect(isNativeClient(req({ 'x-client': 'web' }))).toBe(false);
    expect(isNativeClient(req())).toBe(false);
  });

  it('converts days to seconds', () => {
    expect(sessionSeconds(30)).toBe(2_592_000);
    expect(sessionSeconds(7)).toBe(604_800);
  });
});

describe('readRefreshToken', () => {
  it('reads the cookie for browsers', () => {
    expect(readRefreshToken(req({}, { refreshToken: 'cookie-token' }))).toBe('cookie-token');
  });

  it('ignores a body token from a non-native client', () => {
    expect(readRefreshToken(req({}, {}, { refreshToken: 'body-token' }))).toBeUndefined();
  });

  it('reads the body token from the mobile app', () => {
    expect(readRefreshToken(req({ 'x-client': 'native-app' }, {}, { refreshToken: 'body-token' }))).toBe('body-token');
  });

  it('prefers the cookie when both exist', () => {
    expect(readRefreshToken(req({ 'x-client': 'native-app' }, { refreshToken: 'c' }, { refreshToken: 'b' }))).toBe('c');
  });

  it('works when cookie-parser produced no cookies object', () => {
    expect(readRefreshToken(req({ 'x-client': 'native-app' }, undefined, { refreshToken: 'b' }))).toBe('b');
  });

  it('rejects empty, non-string and oversized tokens', () => {
    const native = { 'x-client': 'native-app' };
    expect(readRefreshToken(req(native, {}, { refreshToken: '' }))).toBeUndefined();
    expect(readRefreshToken(req(native, {}, { refreshToken: 12345 }))).toBeUndefined();
    expect(readRefreshToken(req(native, {}, { refreshToken: { $ne: null } }))).toBeUndefined();
    expect(readRefreshToken(req(native, {}, { refreshToken: 'x'.repeat(2049) }))).toBeUndefined();
    expect(readRefreshToken(req(native, {}, undefined))).toBeUndefined();
  });
});
