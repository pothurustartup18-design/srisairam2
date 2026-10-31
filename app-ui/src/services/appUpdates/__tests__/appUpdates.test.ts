import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { OfferRejected, validateOffer, verifyManifestSignature, type InstalledVersion, type SignedRelease } from '../manifest';
import {
  initialUpdateState,
  isStartupCheckDue,
  shouldPrompt,
  updateReducer,
  formatBytes,
  type UpdateOffer,
  type UpdateState
} from '../updateState';
import { APK_SIGNING_CERT_SHA256, RELEASE_KEY_ID, RELEASE_PUBLIC_KEY_SPKI_B64 } from '../releaseKey';

// ─── fixtures ────────────────────────────────────────────────────────────────

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const spkiB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const keyId = crypto.createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16);
const testKey = { publicKeySpkiB64: spkiB64, keyId };

const signed = (manifest: object, key = privateKey): SignedRelease => {
  const str = JSON.stringify(manifest);
  return {
    releaseId: (manifest as any).releaseId,
    manifest: str,
    signature: crypto.sign('sha256', Buffer.from(str), key).toString('base64'),
    keyId,
    downloadUrl: 'https://example.invalid/x'
  };
};

const installed: InstalledVersion = { versionName: '1.1.0', versionCode: 2, bundleId: 'builtin' };

const nativeManifest = (over: object = {}) => ({
  schemaVersion: 1,
  releaseId: 'android-1.2.0-3',
  kind: 'native',
  channel: 'production',
  packageId: 'com.schoolhub.app',
  createdAt: '2026-10-18T00:00:00Z',
  releaseNotes: ['New attendance screen'],
  native: {
    versionName: '1.2.0',
    versionCode: 3,
    minimumSupportedVersionCode: 2,
    mandatory: false,
    sha256: 'a'.repeat(64),
    size: 5_000_000,
    signingCertSha256: APK_SIGNING_CERT_SHA256
  },
  ...over
});

const webManifest = (over: object = {}) => ({
  schemaVersion: 1,
  releaseId: 'web-20261018-abc1234',
  kind: 'web',
  channel: 'production',
  packageId: 'com.schoolhub.app',
  createdAt: '2026-10-18T00:00:00Z',
  releaseNotes: [],
  web: { bundleId: 'web-20261018-abc1234', compatibleNativeMin: 2, compatibleNativeMax: 2, size: 900_000, checksum: 'f'.repeat(512), sessionKey: 'iv:key' },
  ...over
});

// ─── signature verification ──────────────────────────────────────────────────

describe('verifyManifestSignature', () => {
  it('accepts a correctly signed manifest', async () => {
    expect(await verifyManifestSignature(signed(nativeManifest()), testKey)).toBe(true);
  });

  it('rejects a manifest altered after signing', async () => {
    const r = signed(nativeManifest());
    r.manifest = r.manifest.replace('"mandatory":false', '"mandatory":true');
    expect(await verifyManifestSignature(r, testKey)).toBe(false);
  });

  it('rejects a signature from another key', async () => {
    const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    expect(await verifyManifestSignature(signed(nativeManifest(), other.privateKey), testKey)).toBe(false);
  });

  it('rejects an unknown keyId', async () => {
    expect(await verifyManifestSignature({ ...signed(nativeManifest()), keyId: '0000000000000000' }, testKey)).toBe(false);
  });

  it('rejects malformed signatures without throwing', async () => {
    expect(await verifyManifestSignature({ ...signed(nativeManifest()), signature: '@@@' }, testKey)).toBe(false);
  });

  it('ships a consistent embedded release key and keyId', () => {
    const der = Buffer.from(RELEASE_PUBLIC_KEY_SPKI_B64, 'base64');
    expect(crypto.createHash('sha256').update(der).digest('hex').slice(0, 16)).toBe(RELEASE_KEY_ID);
    expect(crypto.createPublicKey({ key: der, format: 'der', type: 'spki' }).asymmetricKeyDetails?.modulusLength).toBe(2048);
  });
});

// ─── offer validation ────────────────────────────────────────────────────────

describe('validateOffer', () => {
  it('accepts a newer native release signed with the expected certificate', () => {
    expect(validateOffer(signed(nativeManifest()), 'native', installed, 'production').native?.versionCode).toBe(3);
  });

  it('accepts a compatible web bundle', () => {
    expect(validateOffer(signed(webManifest()), 'web', installed, 'production').web?.bundleId).toBe('web-20261018-abc1234');
  });

  it.each([
    ['not newer native', () => signed(nativeManifest({ native: { ...nativeManifest().native, versionCode: 2 } })), 'native'],
    ['wrong certificate', () => signed(nativeManifest({ native: { ...nativeManifest().native, signingCertSha256: 'b'.repeat(64) } })), 'native'],
    ['other package', () => signed(nativeManifest({ packageId: 'com.edutrack.app' })), 'native'],
    ['other channel', () => signed(nativeManifest({ channel: 'staging' })), 'native'],
    ['kind mismatch', () => signed(webManifest()), 'native'],
    ['incompatible native (too old)', () => signed(webManifest({ web: { ...webManifest().web, compatibleNativeMin: 3, compatibleNativeMax: 3 } })), 'web'],
    ['incompatible native (too new)', () => signed(webManifest({ web: { ...webManifest().web, compatibleNativeMin: 1, compatibleNativeMax: 1 } })), 'web'],
    ['release id swapped', () => ({ ...signed(webManifest()), releaseId: 'web-other-0001' }), 'web']
  ] as const)('rejects %s', (_label, make, kind) => {
    expect(() => validateOffer(make(), kind, installed, 'production')).toThrow(OfferRejected);
  });

  it('rejects a web bundle that is already installed', () => {
    expect(() => validateOffer(signed(webManifest()), 'web', { ...installed, bundleId: 'web-20261018-abc1234' }, 'production')).toThrow(OfferRejected);
  });
});

// ─── state machine ───────────────────────────────────────────────────────────

const offer = (kind: 'native' | 'web' = 'web', mandatory = false): UpdateOffer => {
  const m = kind === 'web' ? webManifest() : nativeManifest();
  return { kind, release: signed(m), manifest: m as any, mandatory, versionLabel: 'v', sizeBytes: 1, notes: [] };
};
const run = (actions: Parameters<typeof updateReducer>[1][], from: UpdateState = initialUpdateState) => actions.reduce(updateReducer, from);

describe('updateReducer', () => {
  it('check → up to date', () => {
    const s = run([{ type: 'CHECK_START' }, { type: 'CHECK_DONE', offer: null, checkedAt: 't1' }]);
    expect(s.status).toBe('up-to-date');
    expect(s.lastCheckedAt).toBe('t1');
  });

  it('check → available → downloading → ready → activating', () => {
    const s = run([
      { type: 'CHECK_START' },
      { type: 'CHECK_DONE', offer: offer(), checkedAt: 't' },
      { type: 'DOWNLOAD_START' },
      { type: 'PROGRESS', percent: 40 }
    ]);
    expect(s).toMatchObject({ status: 'downloading', progress: 40 });
    const ready = run([{ type: 'READY', ref: 'bundle-1' }], s);
    expect(ready).toMatchObject({ status: 'ready', readyRef: 'bundle-1' });
    expect(run([{ type: 'ACTIVATING' }], ready).status).toBe('activating');
  });

  it('a check result never interrupts a download in progress', () => {
    const s = run([{ type: 'CHECK_DONE', offer: offer(), checkedAt: 't' }, { type: 'DOWNLOAD_START' }]);
    const after = run([{ type: 'CHECK_START' }, { type: 'CHECK_DONE', offer: null, checkedAt: 't2' }, { type: 'CHECK_FAILED', error: 'x' }], s);
    expect(after.status).toBe('downloading');
    expect(after.offer).not.toBeNull();
  });

  it('apply-on-next-launch is reported as scheduled, not completed', () => {
    const s = run([
      { type: 'CHECK_DONE', offer: offer(), checkedAt: 't' },
      { type: 'DOWNLOAD_START' },
      { type: 'READY', ref: 'b1' },
      { type: 'ACTIVATING' },
      { type: 'SCHEDULED' }
    ]);
    expect(s).toMatchObject({ status: 'ready', scheduled: true });
  });

  it('cancelled APK install keeps the verified file for retry', () => {
    const s = run([
      { type: 'CHECK_DONE', offer: offer('native'), checkedAt: 't' },
      { type: 'DOWNLOAD_START' },
      { type: 'VERIFYING' },
      { type: 'READY', ref: '/cache/apk-updates/update-3.apk' },
      { type: 'AWAITING_INSTALL' },
      { type: 'INSTALL_CANCELLED' }
    ]);
    expect(s).toMatchObject({ status: 'cancelled', readyRef: '/cache/apk-updates/update-3.apk' });
  });

  it('download failure surfaces an error and clears progress', () => {
    const s = run([{ type: 'CHECK_DONE', offer: offer(), checkedAt: 't' }, { type: 'DOWNLOAD_START' }, { type: 'FAILED', error: 'security check' }]);
    expect(s).toMatchObject({ status: 'failed', error: 'security check', progress: null });
  });

  it('recovery and completion states carry their message', () => {
    expect(run([{ type: 'RECOVERED', message: 'rolled back' }])).toMatchObject({ status: 'recovered', message: 'rolled back' });
    expect(run([{ type: 'COMPLETED', message: 'done' }])).toMatchObject({ status: 'completed', offer: null });
  });

  it('ignores download without an offer', () => {
    expect(run([{ type: 'DOWNLOAD_START' }]).status).toBe('idle');
  });
});

// ─── policies ────────────────────────────────────────────────────────────────

describe('policies', () => {
  const now = 1_000_000_000_000;

  it('respects dismissal of optional updates for its duration only', () => {
    const d = { releaseId: 'r1', until: now + 1000 };
    expect(shouldPrompt({ releaseId: 'r1', mandatory: false }, d, now)).toBe(false);
    expect(shouldPrompt({ releaseId: 'r1', mandatory: false }, d, now + 2000)).toBe(true);
    expect(shouldPrompt({ releaseId: 'r2', mandatory: false }, d, now)).toBe(true);
  });

  it('never suppresses mandatory updates', () => {
    expect(shouldPrompt({ releaseId: 'r1', mandatory: true }, { releaseId: 'r1', until: now + 1e9 }, now)).toBe(true);
  });

  it('throttles startup checks and backs off after failures', () => {
    const h = 60 * 60 * 1000;
    expect(isStartupCheckDue(null, now)).toBe(true);
    expect(isStartupCheckDue({ lastAttemptAt: now - 5 * h, consecutiveFailures: 0 }, now)).toBe(false);
    expect(isStartupCheckDue({ lastAttemptAt: now - 6 * h, consecutiveFailures: 0 }, now)).toBe(true);
    expect(isStartupCheckDue({ lastAttemptAt: now - 20 * 60 * 1000, consecutiveFailures: 1 }, now)).toBe(true);
    expect(isStartupCheckDue({ lastAttemptAt: now - 20 * 60 * 1000, consecutiveFailures: 3 }, now)).toBe(false);
    expect(isStartupCheckDue({ lastAttemptAt: now - 23 * h, consecutiveFailures: 20 }, now)).toBe(false);
    expect(isStartupCheckDue({ lastAttemptAt: now - 24 * h, consecutiveFailures: 20 }, now)).toBe(true);
  });

  it('formats sizes', () => {
    expect(formatBytes(0)).toBe('—');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
