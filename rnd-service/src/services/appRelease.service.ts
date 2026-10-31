import crypto from 'crypto';

/**
 * Pure release-manifest logic for the Android update pipeline: signature
 * verification, schema validation, rollout cohorts and compatibility
 * selection. No database or S3 access here so it can be unit-tested directly;
 * routes/shared/appUpdates.routes.ts does the I/O.
 *
 * Trust model: the CI release pipeline holds the RSA release-signing private
 * key and signs every manifest. The server only knows the public key
 * (APP_RELEASE_PUBLIC_KEY) and refuses to register a manifest whose signature
 * does not verify. Installed apps verify the same signature again, and the
 * live-update plugin independently verifies each bundle's RSA-signed checksum,
 * so a compromised API server cannot push code to devices.
 */

export const MANIFEST_SCHEMA_VERSION = 1;
export const DEFAULT_PACKAGE_ID = 'com.schoolhub.app';
export const CHANNELS = ['staging', 'production'] as const;
export type Channel = (typeof CHANNELS)[number];

export const RELEASE_ID_RE = /^[a-z0-9][a-z0-9._-]{2,63}$/;
export const INSTALL_ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
// RSA-2048 private-key-encrypted SHA-256, hex encoded (256 bytes).
const SIGNED_CHECKSUM_RE = /^[0-9a-f]{512}$/;
const SESSION_KEY_RE = /^[A-Za-z0-9+/=]{16,64}:[A-Za-z0-9+/=]{300,400}$/;
const VERSION_NAME_RE = /^\d+\.\d+\.\d+$/;
const MAX_VERSION_CODE = 2100000000; // Play/Android hard limit
const MAX_ARTIFACT_BYTES = 300 * 1024 * 1024;

export interface NativeSection {
  versionName: string;
  versionCode: number;
  minimumSupportedVersionCode: number;
  mandatory: boolean;
  artifactKey: string;
  sha256: string;
  size: number;
  signingCertSha256: string;
}

export interface WebSection {
  bundleId: string;
  compatibleNativeMin: number;
  compatibleNativeMax: number;
  artifactKey: string;
  artifactSha256: string;
  size: number;
  checksum: string;
  sessionKey: string;
}

export interface ReleaseManifest {
  schemaVersion: number;
  releaseId: string;
  kind: 'native' | 'web';
  channel: Channel;
  packageId: string;
  createdAt: string;
  releaseNotes: string[];
  native?: NativeSection;
  web?: WebSection;
}

export class ManifestError extends Error {}

// ─── Keys & signatures ────────────────────────────────────────────────────────

/** Short stable identifier of a public key: first 16 hex chars of SHA-256(SPKI DER). */
export function computeKeyId(publicKeyPem: string): string {
  const der = crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(der).digest('hex').slice(0, 16);
}

/** RSASSA-PKCS1-v1_5 / SHA-256 over the exact UTF-8 bytes of the manifest string. */
export function verifyManifestSignature(manifest: string, signatureB64: string, publicKeyPem: string): boolean {
  try {
    return crypto.verify('sha256', Buffer.from(manifest, 'utf8'), publicKeyPem, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}

// ─── Schema validation ────────────────────────────────────────────────────────

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

const isArtifactKey = (v: unknown, kind: 'native' | 'web', releaseId: string): v is string =>
  typeof v === 'string' &&
  v.startsWith(`releases/${kind === 'native' ? 'android' : 'web'}/`) &&
  v.includes(`/${releaseId}/`) &&
  !v.includes('..') &&
  v.length <= 256;

/**
 * Parses and strictly validates a manifest string. Throws ManifestError with a
 * human-readable reason on the first problem found.
 */
export function parseManifest(manifestStr: string, expectedPackageId: string = DEFAULT_PACKAGE_ID): ReleaseManifest {
  let m: any;
  try {
    m = JSON.parse(manifestStr);
  } catch {
    throw new ManifestError('Manifest is not valid JSON.');
  }
  if (!m || typeof m !== 'object') throw new ManifestError('Manifest must be an object.');
  if (m.schemaVersion !== MANIFEST_SCHEMA_VERSION) throw new ManifestError(`Unsupported schemaVersion ${m.schemaVersion}.`);
  if (typeof m.releaseId !== 'string' || !RELEASE_ID_RE.test(m.releaseId)) throw new ManifestError('Invalid releaseId.');
  if (m.kind !== 'native' && m.kind !== 'web') throw new ManifestError('kind must be "native" or "web".');
  if (!CHANNELS.includes(m.channel)) throw new ManifestError('Invalid channel.');
  if (m.packageId !== expectedPackageId) throw new ManifestError(`packageId must be ${expectedPackageId}.`);
  if (typeof m.createdAt !== 'string' || Number.isNaN(Date.parse(m.createdAt))) throw new ManifestError('Invalid createdAt.');
  if (
    !Array.isArray(m.releaseNotes) ||
    m.releaseNotes.length > 20 ||
    !m.releaseNotes.every((n: unknown) => typeof n === 'string' && n.length > 0 && n.length <= 300)
  ) {
    throw new ManifestError('releaseNotes must be 0-20 non-empty strings of at most 300 chars.');
  }

  if (m.kind === 'native') {
    const n = m.native;
    if (!n || m.web) throw new ManifestError('A native release must contain only a "native" section.');
    if (typeof n.versionName !== 'string' || !VERSION_NAME_RE.test(n.versionName)) throw new ManifestError('native.versionName must be MAJOR.MINOR.PATCH.');
    if (!isInt(n.versionCode, 1, MAX_VERSION_CODE)) throw new ManifestError('Invalid native.versionCode.');
    if (!isInt(n.minimumSupportedVersionCode, 1, n.versionCode)) throw new ManifestError('native.minimumSupportedVersionCode must be between 1 and versionCode.');
    if (typeof n.mandatory !== 'boolean') throw new ManifestError('native.mandatory must be boolean.');
    if (!isArtifactKey(n.artifactKey, 'native', m.releaseId)) throw new ManifestError('Invalid native.artifactKey.');
    if (typeof n.sha256 !== 'string' || !SHA256_HEX_RE.test(n.sha256)) throw new ManifestError('native.sha256 must be lowercase hex SHA-256.');
    if (!isInt(n.size, 1, MAX_ARTIFACT_BYTES)) throw new ManifestError('Invalid native.size.');
    if (typeof n.signingCertSha256 !== 'string' || !SHA256_HEX_RE.test(n.signingCertSha256)) throw new ManifestError('native.signingCertSha256 must be lowercase hex SHA-256.');
  } else {
    const w = m.web;
    if (!w || m.native) throw new ManifestError('A web release must contain only a "web" section.');
    if (w.bundleId !== m.releaseId) throw new ManifestError('web.bundleId must equal releaseId.');
    if (!isInt(w.compatibleNativeMin, 1, MAX_VERSION_CODE) || !isInt(w.compatibleNativeMax, w.compatibleNativeMin ?? 1, MAX_VERSION_CODE)) {
      throw new ManifestError('web.compatibleNativeMin/Max must be integers with min <= max.');
    }
    if (!isArtifactKey(w.artifactKey, 'web', m.releaseId)) throw new ManifestError('Invalid web.artifactKey.');
    if (typeof w.artifactSha256 !== 'string' || !SHA256_HEX_RE.test(w.artifactSha256)) throw new ManifestError('web.artifactSha256 must be lowercase hex SHA-256.');
    if (!isInt(w.size, 1, MAX_ARTIFACT_BYTES)) throw new ManifestError('Invalid web.size.');
    if (typeof w.checksum !== 'string' || !SIGNED_CHECKSUM_RE.test(w.checksum)) throw new ManifestError('web.checksum must be an RSA-2048 signed checksum (512 hex chars).');
    if (typeof w.sessionKey !== 'string' || !SESSION_KEY_RE.test(w.sessionKey)) throw new ManifestError('Invalid web.sessionKey.');
  }
  return m as ReleaseManifest;
}

// ─── Rollout & selection ──────────────────────────────────────────────────────

/**
 * Deterministic cohort assignment: the same install always lands in the same
 * bucket for a given release, so raising the percentage only ever adds devices.
 * Without an installId a device is only included at 100%.
 */
export function isInRollout(installId: string | undefined, releaseId: string, rolloutPercent: number): boolean {
  if (rolloutPercent >= 100) return true;
  if (rolloutPercent <= 0 || !installId) return false;
  const bucket = crypto.createHash('sha256').update(`${releaseId}:${installId}`).digest().readUInt32BE(0) % 100;
  return bucket < rolloutPercent;
}

export interface CandidateRelease {
  releaseId: string;
  rolloutPercent: number;
  versionCode?: number;
  minimumSupportedVersionCode?: number;
  compatibleNativeMin?: number;
  compatibleNativeMax?: number;
  promotedAt?: Date;
}

export interface NativeSelection<T> {
  release: T | null;
  mandatory: boolean;
}

/**
 * Picks the native APK to offer. `published` must contain only published
 * native releases of the client's channel. Never offers a downgrade or the
 * installed version. When the client is below the highest
 * minimumSupportedVersionCode, the update is mandatory and the rollout cohort
 * is ignored so the device is never stranded on an unsupported version.
 */
export function selectNativeUpdate<T extends CandidateRelease>(
  published: T[],
  clientVersionCode: number,
  installId?: string
): NativeSelection<T> {
  const newer = published
    .filter(r => typeof r.versionCode === 'number' && r.versionCode > clientVersionCode)
    .sort((a, b) => (b.versionCode as number) - (a.versionCode as number));
  if (newer.length === 0) return { release: null, mandatory: false };

  const minSupported = Math.max(0, ...published.map(r => r.minimumSupportedVersionCode ?? 0));
  if (clientVersionCode < minSupported) return { release: newer[0], mandatory: true };

  const eligible = newer.find(r => isInRollout(installId, r.releaseId, r.rolloutPercent));
  return { release: eligible ?? null, mandatory: false };
}

/**
 * Picks the live web bundle to offer. The most recently promoted compatible
 * release is the channel's target; promoting an older known-good release makes
 * it the target again, which is how a bad bundle is rolled back fleet-wide.
 * Returns null when the device already runs the target bundle.
 */
export function selectLiveUpdate<T extends CandidateRelease>(
  published: T[],
  clientVersionCode: number,
  clientBundleId: string,
  installId?: string
): T | null {
  const target = published
    .filter(
      r =>
        typeof r.compatibleNativeMin === 'number' &&
        typeof r.compatibleNativeMax === 'number' &&
        r.compatibleNativeMin <= clientVersionCode &&
        clientVersionCode <= r.compatibleNativeMax &&
        isInRollout(installId, r.releaseId, r.rolloutPercent)
    )
    .sort((a, b) => (b.promotedAt?.getTime() ?? 0) - (a.promotedAt?.getTime() ?? 0))[0];
  if (!target || target.releaseId === clientBundleId) return null;
  return target;
}

/** S3 reports full-object SHA-256 checksums as base64; manifests use hex. */
export const hexToBase64 = (hex: string): string => Buffer.from(hex, 'hex').toString('base64');

/** Constant-time comparison for the CI release token. */
export function tokensMatch(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected || expected.length < 32) return false;
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
