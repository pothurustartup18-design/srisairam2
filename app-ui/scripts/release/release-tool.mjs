#!/usr/bin/env node
/**
 * Release tool for the Android update pipeline (see docs/APP_UPDATES.md).
 * Runs in CI; needs only Node's built-in crypto.
 *
 *   node scripts/release/release-tool.mjs web    --zip dist.zip --channel production
 *        --native-min 2 --native-max 2 [--notes-file notes.txt] [--release-id web-...] --out out/
 *   node scripts/release/release-tool.mjs native --apk app-release.apk --channel production
 *        --version-name 1.1.0 --version-code 2 --min-supported 2 [--mandatory]
 *        --signing-cert-sha256 <hex> [--notes-file notes.txt] --out out/
 *   node scripts/release/release-tool.mjs verify-web --dir out/ --public-key release/keys/release-signing-public.pem
 *
 * The RSA release-signing private key is read from $RELEASE_SIGNING_PRIVATE_KEY
 * (PEM) or --key <file>. It is never written to the output directory.
 *
 * Web bundles use @capgo/capacitor-updater "encryption v2", matching the
 * plugin's Android CryptoCipher: the zip is AES-128-CBC encrypted with a random
 * session key; sessionKey = base64(iv) + ":" + base64(RSA_privateEncrypt(aesKey));
 * checksum = hex(RSA_privateEncrypt(sha256(plain zip))). With a public key
 * configured, the plugin refuses any bundle that was not produced this way.
 *
 * Output (out/): the artifact to upload, manifest.json (exact signed bytes),
 * release.json ({manifest, signature, keyId} for the registration API) and
 * release.env (RELEASE_ID / ARTIFACT_KEY / ARTIFACT_PATH / ARTIFACT_SHA256 for CI).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PACKAGE_ID = 'com.schoolhub.app';
const RELEASE_ID_RE = /^[a-z0-9][a-z0-9._-]{2,63}$/;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new Error(`Unexpected argument: ${a}`);
    const key = a.slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) opts[key] = true;
    else {
      opts[key] = next;
      i++;
    }
  }
  return { command, opts };
}

const fail = msg => {
  console.error(`release-tool: ${msg}`);
  process.exit(1);
};
const req = (opts, key) => (opts[key] === undefined || opts[key] === true ? fail(`--${key} is required`) : opts[key]);
const int = (opts, key) => {
  const v = Number(req(opts, key));
  if (!Number.isInteger(v) || v < 1) fail(`--${key} must be a positive integer`);
  return v;
};
const sha256 = buf => crypto.createHash('sha256').update(buf).digest();

function loadPrivateKey(opts) {
  const pem = opts.key ? fs.readFileSync(opts.key, 'utf8') : process.env.RELEASE_SIGNING_PRIVATE_KEY;
  if (!pem) fail('release signing key missing: set RELEASE_SIGNING_PRIVATE_KEY or pass --key');
  const key = crypto.createPrivateKey(pem.replace(/\\n/g, '\n'));
  if (key.asymmetricKeyDetails?.modulusLength !== 2048) fail('release signing key must be RSA-2048 (updater plugin requirement)');
  return key;
}

const keyIdOf = key => {
  const pub = key.type === 'public' ? key : crypto.createPublicKey(key);
  return sha256(pub.export({ type: 'spki', format: 'der' })).toString('hex').slice(0, 16);
};

function readNotes(opts) {
  if (!opts['notes-file']) return [];
  return fs
    .readFileSync(opts['notes-file'], 'utf8')
    .split(/\r?\n|\|/)
    .map(s => s.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 20)
    .map(s => s.slice(0, 300));
}

function channelOf(opts) {
  const ch = req(opts, 'channel');
  if (ch !== 'staging' && ch !== 'production') fail('--channel must be staging or production');
  return ch;
}

function writeOutputs(outDir, privateKey, manifestObj, artifactName, artifactBuf, extraEnv = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  // Signed bytes are exactly the bytes served to clients; never re-serialize.
  const manifest = JSON.stringify(manifestObj);
  const signature = crypto.sign('sha256', Buffer.from(manifest, 'utf8'), privateKey).toString('base64');
  const keyId = keyIdOf(privateKey);
  const artifactPath = path.join(outDir, artifactName);
  fs.writeFileSync(artifactPath, artifactBuf);
  fs.writeFileSync(path.join(outDir, 'manifest.json'), manifest);
  fs.writeFileSync(path.join(outDir, 'release.json'), JSON.stringify({ manifest, signature, keyId }));
  const section = manifestObj.native ?? manifestObj.web;
  const env = {
    RELEASE_ID: manifestObj.releaseId,
    ARTIFACT_KEY: section.artifactKey,
    ARTIFACT_PATH: artifactPath,
    ARTIFACT_SHA256: sha256(artifactBuf).toString('hex'),
    ARTIFACT_SHA256_B64: sha256(artifactBuf).toString('base64'),
    ...extraEnv
  };
  fs.writeFileSync(
    path.join(outDir, 'release.env'),
    Object.entries(env)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n'
  );
  console.log(`Release ${manifestObj.releaseId} (${manifestObj.kind}, ${manifestObj.channel}) written to ${outDir}`);
  console.log(`  artifact ${section.artifactKey}  sha256=${env.ARTIFACT_SHA256}  size=${artifactBuf.length}`);
  console.log(`  signed with key ${keyId}`);
}

function defaultWebReleaseId() {
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const sha = (process.env.GITHUB_SHA || crypto.randomBytes(4).toString('hex')).slice(0, 7).toLowerCase();
  return `web-${ts}-${sha}`;
}

/** Entry names of a zip, read from its central directory. */
function zipEntryNames(zip) {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) fail('bundle zip has no central directory (not a complete zip file)');
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const names = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > zip.length || zip.readUInt32LE(p) !== 0x02014b50) fail('bundle zip central directory is corrupt');
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    names.push(zip.toString('utf8', p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

/**
 * Refuses any bundle the app's updater plugin would reject when unpacking: it treats an entry that
 * resolves to the base folder ("./") or contains "." / ".." segments as an attack and aborts the whole
 * update ("Failed to download"). Zip the CONTENTS of dist, e.g. `cd dist && zip -r ../bundle.zip .`.
 */
function validateBundleZip(zip) {
  const names = zipEntryNames(zip);
  if (names.length === 0) fail('bundle zip is empty');
  for (const name of names) {
    const segments = name.split('/');
    if (segments[segments.length - 1] === '') segments.pop(); // directory entries end with "/"
    if (name.startsWith('/') || name.includes('\\') || segments.some(s => s === '' || s === '.' || s === '..')) {
      fail(`bundle zip entry "${name}" would be rejected by the app's updater (no "./", "..", absolute or backslash paths). Zip the contents of dist: cd dist && zip -r ../bundle.zip .`);
    }
  }
  if (!names.includes('index.html')) fail('index.html must be at the root of the bundle zip');
  const hidden = names.map(n => n.split('/')[0]).find(t => t.startsWith('.') || t.startsWith('__MACOSX'));
  if (hidden) fail(`bundle zip has a hidden/system entry at its root ("${hidden}"), which the updater ignores`);
}

function cmdWeb(opts) {
  const privateKey = loadPrivateKey(opts);
  const zip = fs.readFileSync(req(opts, 'zip'));
  if (zip.readUInt32LE(0) !== 0x04034b50) fail('--zip is not a zip file');
  validateBundleZip(zip);
  const releaseId = opts['release-id'] || defaultWebReleaseId();
  if (!RELEASE_ID_RE.test(releaseId)) fail(`invalid release id ${releaseId}`);
  const nativeMin = int(opts, 'native-min');
  const nativeMax = int(opts, 'native-max');
  if (nativeMin > nativeMax) fail('--native-min must be <= --native-max');

  const aesKey = crypto.randomBytes(16);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-128-cbc', aesKey, iv);
  const encrypted = Buffer.concat([cipher.update(zip), cipher.final()]);
  const rsa = buf => crypto.privateEncrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }, buf);

  const manifest = {
    schemaVersion: 1,
    releaseId,
    kind: 'web',
    channel: channelOf(opts),
    packageId: PACKAGE_ID,
    createdAt: new Date().toISOString(),
    releaseNotes: readNotes(opts),
    web: {
      bundleId: releaseId,
      compatibleNativeMin: nativeMin,
      compatibleNativeMax: nativeMax,
      artifactKey: `releases/web/${releaseId}/bundle.zip.enc`,
      artifactSha256: sha256(encrypted).toString('hex'),
      size: encrypted.length,
      checksum: rsa(sha256(zip)).toString('hex'),
      sessionKey: `${iv.toString('base64')}:${rsa(aesKey).toString('base64')}`
    }
  };
  writeOutputs(req(opts, 'out'), privateKey, manifest, 'bundle.zip.enc', encrypted);
}

function cmdNative(opts) {
  const privateKey = loadPrivateKey(opts);
  const apk = fs.readFileSync(req(opts, 'apk'));
  const versionName = req(opts, 'version-name');
  if (!/^\d+\.\d+\.\d+$/.test(versionName)) fail('--version-name must be MAJOR.MINOR.PATCH');
  const versionCode = int(opts, 'version-code');
  const minSupported = int(opts, 'min-supported');
  if (minSupported > versionCode) fail('--min-supported must be <= --version-code');
  const cert = String(req(opts, 'signing-cert-sha256')).replace(/:/g, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(cert)) fail('--signing-cert-sha256 must be a SHA-256 fingerprint');
  const releaseId = `android-${versionName}-${versionCode}`;

  const manifest = {
    schemaVersion: 1,
    releaseId,
    kind: 'native',
    channel: channelOf(opts),
    packageId: PACKAGE_ID,
    createdAt: new Date().toISOString(),
    releaseNotes: readNotes(opts),
    native: {
      versionName,
      versionCode,
      minimumSupportedVersionCode: minSupported,
      mandatory: opts.mandatory === true || opts.mandatory === 'true',
      artifactKey: `releases/android/${releaseId}/app-release.apk`,
      sha256: sha256(apk).toString('hex'),
      size: apk.length,
      signingCertSha256: cert
    }
  };
  writeOutputs(req(opts, 'out'), privateKey, manifest, 'app-release.apk', apk);
}

/**
 * Re-checks a web release exactly as the device will: manifest signature,
 * session-key decryption, AES decryption and signed-checksum match.
 */
function cmdVerifyWeb(opts) {
  const dir = req(opts, 'dir');
  const publicKey = crypto.createPublicKey(fs.readFileSync(req(opts, 'public-key'), 'utf8'));
  const { manifest, signature, keyId } = JSON.parse(fs.readFileSync(path.join(dir, 'release.json'), 'utf8'));
  if (keyId !== keyIdOf(publicKey)) fail('keyId does not match the public key');
  if (!crypto.verify('sha256', Buffer.from(manifest, 'utf8'), publicKey, Buffer.from(signature, 'base64'))) fail('manifest signature invalid');
  const { web } = JSON.parse(manifest);
  const enc = fs.readFileSync(path.join(dir, 'bundle.zip.enc'));
  if (sha256(enc).toString('hex') !== web.artifactSha256) fail('artifact sha256 mismatch');
  const rsaOpen = buf => crypto.publicDecrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, buf);
  const [ivB64, keyB64] = web.sessionKey.split(':');
  const aesKey = rsaOpen(Buffer.from(keyB64, 'base64'));
  const decipher = crypto.createDecipheriv('aes-128-cbc', aesKey, Buffer.from(ivB64, 'base64'));
  const zip = Buffer.concat([decipher.update(enc), decipher.final()]);
  const expected = rsaOpen(Buffer.from(web.checksum, 'hex')).toString('hex');
  if (sha256(zip).toString('hex') !== expected) fail('signed checksum does not match decrypted bundle');
  if (zip.readUInt32LE(0) !== 0x04034b50) fail('decrypted bundle is not a zip');
  validateBundleZip(zip);
  console.log(`verify-web OK: ${web.bundleId} (${zip.length} bytes decrypted)`);
}

const { command, opts } = parseArgs(process.argv.slice(2));
try {
  if (command === 'web') cmdWeb(opts);
  else if (command === 'native') cmdNative(opts);
  else if (command === 'verify-web') cmdVerifyWeb(opts);
  else fail('usage: release-tool.mjs <web|native|verify-web> [options]');
} catch (err) {
  fail(err.message);
}
