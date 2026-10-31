import { APK_SIGNING_CERT_SHA256, APP_PACKAGE_ID, RELEASE_KEY_ID, RELEASE_PUBLIC_KEY_SPKI_B64 } from './releaseKey';

/**
 * Client-side checks on release metadata returned by GET /api/app-updates/android.
 * The server is not trusted: every manifest must carry a valid signature from
 * the release key, and its contents must make sense for this installation.
 */

export type UpdateChannel = 'staging' | 'production';

export interface SignedRelease {
  releaseId: string;
  manifest: string;
  signature: string;
  keyId: string;
  downloadUrl?: string;
}

export interface NativeManifest {
  versionName: string;
  versionCode: number;
  minimumSupportedVersionCode: number;
  mandatory: boolean;
  sha256: string;
  size: number;
  signingCertSha256: string;
}

export interface WebManifest {
  bundleId: string;
  compatibleNativeMin: number;
  compatibleNativeMax: number;
  size: number;
  checksum: string;
  sessionKey: string;
}

export interface ReleaseManifest {
  schemaVersion: number;
  releaseId: string;
  kind: 'native' | 'web';
  channel: UpdateChannel;
  packageId: string;
  createdAt: string;
  releaseNotes: string[];
  native?: NativeManifest;
  web?: WebManifest;
}

export interface InstalledVersion {
  versionName: string;
  versionCode: number;
  bundleId: string;
}

export interface VerifyOptions {
  publicKeySpkiB64?: string;
  keyId?: string;
  subtle?: SubtleCrypto;
}

const b64ToBytes = (b64: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** RSASSA-PKCS1-v1_5 / SHA-256 over the exact manifest string. */
export async function verifyManifestSignature(release: SignedRelease, opts: VerifyOptions = {}): Promise<boolean> {
  const subtle = opts.subtle ?? globalThis.crypto?.subtle;
  if (!subtle) return false;
  if (release.keyId !== (opts.keyId ?? RELEASE_KEY_ID)) return false;
  try {
    const key = await subtle.importKey(
      'spki',
      b64ToBytes(opts.publicKeySpkiB64 ?? RELEASE_PUBLIC_KEY_SPKI_B64),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    return await subtle.verify('RSASSA-PKCS1-v1_5', key, b64ToBytes(release.signature), new TextEncoder().encode(release.manifest));
  } catch {
    return false;
  }
}

export class OfferRejected extends Error {}

/**
 * Validates a signature-checked manifest against this install. Throws
 * OfferRejected (never offered to the user) when anything is inconsistent.
 */
export function validateOffer(
  release: SignedRelease,
  expectedKind: 'native' | 'web',
  installed: InstalledVersion,
  channel: UpdateChannel,
  signingCertSha256: string = APK_SIGNING_CERT_SHA256
): ReleaseManifest {
  let m: ReleaseManifest;
  try {
    m = JSON.parse(release.manifest);
  } catch {
    throw new OfferRejected('Manifest is not valid JSON.');
  }
  if (m.schemaVersion !== 1) throw new OfferRejected('Unsupported manifest version.');
  if (m.releaseId !== release.releaseId) throw new OfferRejected('Release ID does not match the signed manifest.');
  if (m.packageId !== APP_PACKAGE_ID) throw new OfferRejected('Release is for a different app.');
  if (m.channel !== channel) throw new OfferRejected('Release is for a different channel.');
  if (m.kind !== expectedKind) throw new OfferRejected('Release kind mismatch.');
  if (!Array.isArray(m.releaseNotes)) m.releaseNotes = [];

  if (expectedKind === 'native') {
    const n = m.native;
    if (!n) throw new OfferRejected('Native section missing.');
    if (!(n.versionCode > installed.versionCode)) throw new OfferRejected('Native release is not newer than the installed app.');
    if (n.signingCertSha256 !== signingCertSha256) throw new OfferRejected('Native release is signed with an unexpected certificate.');
    if (!/^[0-9a-f]{64}$/.test(n.sha256)) throw new OfferRejected('Native release checksum is malformed.');
  } else {
    const w = m.web;
    if (!w) throw new OfferRejected('Web section missing.');
    if (w.bundleId !== m.releaseId) throw new OfferRejected('Bundle ID mismatch.');
    if (installed.versionCode < w.compatibleNativeMin || installed.versionCode > w.compatibleNativeMax) {
      throw new OfferRejected('Web bundle is not compatible with this app version.');
    }
    if (w.bundleId === installed.bundleId) throw new OfferRejected('Bundle already installed.');
  }
  return m;
}
