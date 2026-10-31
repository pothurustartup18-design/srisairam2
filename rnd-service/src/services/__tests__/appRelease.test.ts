import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  computeKeyId,
  hexToBase64,
  isInRollout,
  parseManifest,
  selectLiveUpdate,
  selectNativeUpdate,
  tokensMatch,
  verifyManifestSignature,
  ManifestError
} from '../appRelease.service';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicPem = publicKey.export({ type: 'pkcs1', format: 'pem' }).toString();
const otherKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

const sign = (s: string, key = privateKey) => crypto.sign('sha256', Buffer.from(s, 'utf8'), key).toString('base64');
const hex = (n: number) => crypto.randomBytes(n).toString('hex');

const nativeManifest = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  releaseId: 'android-1.1.0-2',
  kind: 'native',
  channel: 'production',
  packageId: 'com.schoolhub.app',
  createdAt: '2026-10-18T00:00:00.000Z',
  releaseNotes: ['Signed release build'],
  native: {
    versionName: '1.1.0',
    versionCode: 2,
    minimumSupportedVersionCode: 1,
    mandatory: false,
    artifactKey: 'releases/android/android-1.1.0-2/app-release.apk',
    sha256: hex(32),
    size: 5000000,
    signingCertSha256: hex(32)
  },
  ...over
});

const webManifest = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  releaseId: 'web-20261018-0001',
  kind: 'web',
  channel: 'production',
  packageId: 'com.schoolhub.app',
  createdAt: '2026-10-18T00:00:00.000Z',
  releaseNotes: [],
  web: {
    bundleId: 'web-20261018-0001',
    compatibleNativeMin: 2,
    compatibleNativeMax: 2,
    artifactKey: 'releases/web/web-20261018-0001/bundle.zip.enc',
    artifactSha256: hex(32),
    size: 1200000,
    checksum: hex(256),
    sessionKey: `${crypto.randomBytes(16).toString('base64')}:${crypto.randomBytes(256).toString('base64')}`
  },
  ...over
});

describe('manifest signatures', () => {
  const manifest = JSON.stringify(nativeManifest());

  it('accepts a manifest signed with the release key', () => {
    expect(verifyManifestSignature(manifest, sign(manifest), publicPem)).toBe(true);
  });

  it('rejects a manifest modified after signing', () => {
    const tampered = manifest.replace('"mandatory":false', '"mandatory":true');
    expect(verifyManifestSignature(tampered, sign(manifest), publicPem)).toBe(false);
  });

  it('rejects a signature from a different key', () => {
    expect(verifyManifestSignature(manifest, sign(manifest, otherKey.privateKey), publicPem)).toBe(false);
  });

  it('rejects garbage signatures without throwing', () => {
    expect(verifyManifestSignature(manifest, 'not-base64!!', publicPem)).toBe(false);
  });

  it('derives the same keyId from PKCS#1 and SPKI encodings', () => {
    const spki = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    expect(computeKeyId(publicPem)).toBe(computeKeyId(spki));
    expect(computeKeyId(publicPem)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('parseManifest', () => {
  it('accepts valid native and web manifests', () => {
    expect(parseManifest(JSON.stringify(nativeManifest())).kind).toBe('native');
    expect(parseManifest(JSON.stringify(webManifest())).kind).toBe('web');
  });

  it.each([
    ['wrong package', nativeManifest({ packageId: 'com.edutrack.app' })],
    ['unknown schema', nativeManifest({ schemaVersion: 2 })],
    ['bad channel', nativeManifest({ channel: 'beta' })],
    ['bad release id', nativeManifest({ releaseId: '../evil' })],
    ['both sections', { ...nativeManifest(), web: webManifest().web }],
    ['min supported above versionCode', nativeManifest({ native: { ...nativeManifest().native, minimumSupportedVersionCode: 3 } })],
    ['uppercase sha', nativeManifest({ native: { ...nativeManifest().native, sha256: hex(32).toUpperCase() } })],
    ['artifact outside release prefix', nativeManifest({ native: { ...nativeManifest().native, artifactKey: 'uploads/app.apk' } })],
    ['artifact path traversal', nativeManifest({ native: { ...nativeManifest().native, artifactKey: 'releases/android/android-1.1.0-2/../x.apk' } })],
    ['unsigned plain checksum', webManifest({ web: { ...webManifest().web, checksum: hex(32) } })],
    ['bundleId != releaseId', webManifest({ web: { ...webManifest().web, bundleId: 'web-other-001' } })],
    ['inverted compat range', webManifest({ web: { ...webManifest().web, compatibleNativeMin: 3, compatibleNativeMax: 2 } })],
    ['too many notes', nativeManifest({ releaseNotes: Array(21).fill('x') })]
  ])('rejects %s', (_label, m) => {
    expect(() => parseManifest(JSON.stringify(m))).toThrow(ManifestError);
  });

  it('rejects non-JSON', () => {
    expect(() => parseManifest('{nope')).toThrow(ManifestError);
  });
});

describe('isInRollout', () => {
  it('includes everyone at 100% and nobody at 0%', () => {
    expect(isInRollout('install-abc-123', 'r1x', 100)).toBe(true);
    expect(isInRollout('install-abc-123', 'r1x', 0)).toBe(false);
  });

  it('excludes installs without an id below 100%', () => {
    expect(isInRollout(undefined, 'r1x', 99)).toBe(false);
  });

  it('is deterministic and roughly proportional', () => {
    const ids = Array.from({ length: 2000 }, (_, i) => `install-${i}-padding`);
    const in10 = ids.filter(id => isInRollout(id, 'web-x-001', 10));
    expect(in10.length).toBeGreaterThan(120);
    expect(in10.length).toBeLessThan(280);
    // raising the percentage only adds devices
    expect(in10.every(id => isInRollout(id, 'web-x-001', 50))).toBe(true);
    expect(isInRollout(ids[0], 'web-x-001', 10)).toBe(isInRollout(ids[0], 'web-x-001', 10));
  });
});

describe('selectNativeUpdate', () => {
  const r = (releaseId: string, versionCode: number, minimumSupportedVersionCode = 1, rolloutPercent = 100) => ({
    releaseId,
    versionCode,
    minimumSupportedVersionCode,
    rolloutPercent
  });

  it('returns nothing when up to date', () => {
    expect(selectNativeUpdate([r('a', 2)], 2, 'install-0001')).toEqual({ release: null, mandatory: false });
  });

  it('never offers a downgrade', () => {
    expect(selectNativeUpdate([r('a', 2)], 3, 'install-0001').release).toBeNull();
  });

  it('offers the highest eligible version', () => {
    expect(selectNativeUpdate([r('a', 2), r('b', 4), r('c', 3)], 1, 'install-0001').release?.releaseId).toBe('b');
  });

  it('falls back to a lower version when the newest is outside the cohort', () => {
    const sel = selectNativeUpdate([r('a', 3), r('b', 4, 1, 0)], 2, 'install-0001');
    expect(sel.release?.releaseId).toBe('a');
  });

  it('marks updates mandatory below minimumSupportedVersionCode and ignores rollout', () => {
    const sel = selectNativeUpdate([r('a', 5, 4, 0)], 3, 'install-0001');
    expect(sel).toEqual({ release: expect.objectContaining({ releaseId: 'a' }), mandatory: true });
  });
});

describe('selectLiveUpdate', () => {
  const w = (releaseId: string, min: number, max: number, promotedAt: string, rolloutPercent = 100) => ({
    releaseId,
    compatibleNativeMin: min,
    compatibleNativeMax: max,
    rolloutPercent,
    promotedAt: new Date(promotedAt)
  });

  it('offers the most recently promoted compatible bundle', () => {
    const list = [w('web-a-001', 2, 2, '2026-10-01'), w('web-b-001', 2, 2, '2026-10-05')];
    expect(selectLiveUpdate(list, 2, 'builtin', 'install-0001')?.releaseId).toBe('web-b-001');
  });

  it('returns nothing when already on the target bundle', () => {
    expect(selectLiveUpdate([w('web-a-001', 2, 2, '2026-10-01')], 2, 'web-a-001', 'install-0001')).toBeNull();
  });

  it('never offers bundles outside the native compatibility range', () => {
    const list = [w('web-old-001', 1, 1, '2026-10-09'), w('web-new-001', 3, 3, '2026-10-10')];
    expect(selectLiveUpdate(list, 2, 'builtin', 'install-0001')).toBeNull();
  });

  it('re-promoting an older bundle rolls clients back to it', () => {
    const list = [w('web-bad-001', 2, 2, '2026-10-05'), w('web-good-001', 2, 2, '2026-10-06')];
    expect(selectLiveUpdate(list, 2, 'web-bad-001', 'install-0001')?.releaseId).toBe('web-good-001');
  });

  it('skips bundles outside the rollout cohort', () => {
    expect(selectLiveUpdate([w('web-a-001', 2, 2, '2026-10-01', 0)], 2, 'builtin', 'install-0001')).toBeNull();
  });
});

describe('helpers', () => {
  it('converts hex SHA-256 to the base64 form S3 reports', () => {
    const buf = crypto.createHash('sha256').update('x').digest();
    expect(hexToBase64(buf.toString('hex'))).toBe(buf.toString('base64'));
  });

  it('compares release tokens safely', () => {
    const token = 'a'.repeat(40);
    expect(tokensMatch(token, token)).toBe(true);
    expect(tokensMatch('b'.repeat(40), token)).toBe(false);
    expect(tokensMatch(undefined, token)).toBe(false);
    expect(tokensMatch('short', 'short')).toBe(false); // expected token too weak
  });
});
