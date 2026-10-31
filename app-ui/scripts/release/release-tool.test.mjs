import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * End-to-end checks of the release tool with a throwaway key: what it produces
 * must decrypt/verify exactly the way the device plugin does, and any
 * tampering must be caught.
 */
const TOOL = path.resolve('scripts/release/release-tool.mjs');
const run = args => execFileSync(process.execPath, [TOOL, ...args], { encoding: 'utf8', stdio: 'pipe' });
const runFails = args => {
  try {
    run(args);
    return null;
  } catch (e) {
    return String(e.stderr);
  }
};

/** Minimal valid zip (stored entries, with a central directory) containing the given entry names. */
function makeZip(names) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const n of names) {
    const name = Buffer.from(n);
    const data = n.endsWith('/') ? Buffer.alloc(0) : Buffer.from('x');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const entry = Buffer.concat([local, name, data]);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(entry);
    centrals.push(Buffer.concat([central, name]));
    offset += entry.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(names.length, 8);
  eocd.writeUInt16LE(names.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

let dir;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reltool-'));
  const k = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  fs.writeFileSync(path.join(dir, 'k.pem'), k.privateKey.export({ type: 'pkcs1', format: 'pem' }));
  fs.writeFileSync(path.join(dir, 'pub.pem'), k.publicKey.export({ type: 'pkcs1', format: 'pem' }));
  fs.writeFileSync(path.join(dir, 'dist.zip'), makeZip(['index.html', 'assets/', 'assets/app.js']));
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'First note\n- Second note\n');
  fs.writeFileSync(path.join(dir, 'fake.apk'), crypto.randomBytes(4096));
});

describe('release-tool web: bundle zip layout (the updater aborts on bad entries)', () => {
  const build = (name, entries) => {
    const f = path.join(dir, `${name}.zip`);
    fs.writeFileSync(f, makeZip(entries));
    return runFails(['web', '--key', path.join(dir, 'k.pem'), '--zip', f, '--channel', 'staging', '--native-min', '2', '--native-max', '2',
      '--notes-file', path.join(dir, 'notes.txt'), '--release-id', `web-zip-${name}`, '--out', path.join(dir, `out-${name}`)]);
  };

  it('accepts a normal bundle', () => {
    expect(build('ok', ['index.html', 'assets/', 'assets/app.js', 'icons/logo.svg'])).toBeNull();
  });

  it('rejects "./"-prefixed entries (what "tar … ." produces) that made the phone fail to download', () => {
    expect(build('dot', ['./', './index.html', './assets/app.js'])).toMatch(/would be rejected by the app's updater/);
  });

  it('rejects path traversal, absolute and backslash entries', () => {
    expect(build('trav', ['index.html', '../evil.js'])).toMatch(/would be rejected/);
    expect(build('abs', ['index.html', '/etc/passwd'])).toMatch(/would be rejected/);
    expect(build('bs', ['index.html', 'assets\\app.js'])).toMatch(/would be rejected/);
    expect(build('dotseg', ['index.html', 'assets/./app.js'])).toMatch(/would be rejected/);
  });

  it('rejects a bundle without index.html at the root', () => {
    expect(build('noindex', ['app/index.html', 'app/a.js'])).toMatch(/index\.html must be at the root/);
  });

  it('rejects hidden or system entries at the root', () => {
    expect(build('hidden', ['index.html', '.DS_Store'])).toMatch(/hidden\/system entry/);
    expect(build('macosx', ['index.html', '__MACOSX/x'])).toMatch(/hidden\/system entry/);
  });

  it('rejects an empty or truncated zip', () => {
    const f = path.join(dir, 'trunc.zip');
    fs.writeFileSync(f, makeZip(['index.html']).subarray(0, 40));
    expect(runFails(['web', '--key', path.join(dir, 'k.pem'), '--zip', f, '--channel', 'staging', '--native-min', '2', '--native-max', '2',
      '--notes-file', path.join(dir, 'notes.txt'), '--release-id', 'web-zip-trunc', '--out', path.join(dir, 'out-trunc')])).toMatch(/central directory/);
  });
});

describe('release-tool web', () => {
  it('produces a release the device-side verification accepts', () => {
    run(['web', '--key', path.join(dir, 'k.pem'), '--zip', path.join(dir, 'dist.zip'), '--channel', 'staging',
      '--native-min', '2', '--native-max', '2', '--notes-file', path.join(dir, 'notes.txt'), '--release-id', 'web-test-0001', '--out', path.join(dir, 'web')]);
    expect(run(['verify-web', '--dir', path.join(dir, 'web'), '--public-key', path.join(dir, 'pub.pem')])).toMatch(/verify-web OK/);
    const m = JSON.parse(JSON.parse(fs.readFileSync(path.join(dir, 'web/release.json'), 'utf8')).manifest);
    expect(m.releaseNotes).toEqual(['First note', 'Second note']);
    expect(m.web.checksum).toMatch(/^[0-9a-f]{512}$/);
    expect(m.web.artifactKey).toBe('releases/web/web-test-0001/bundle.zip.enc');
  });

  it('detects a tampered bundle', () => {
    fs.cpSync(path.join(dir, 'web'), path.join(dir, 'web-bad'), { recursive: true });
    const f = path.join(dir, 'web-bad/bundle.zip.enc');
    const buf = fs.readFileSync(f);
    buf[10] ^= 0xff;
    fs.writeFileSync(f, buf);
    expect(runFails(['verify-web', '--dir', path.join(dir, 'web-bad'), '--public-key', path.join(dir, 'pub.pem')])).toMatch(/sha256 mismatch/);
  });

  it('detects a tampered manifest', () => {
    fs.cpSync(path.join(dir, 'web'), path.join(dir, 'web-bad2'), { recursive: true });
    const f = path.join(dir, 'web-bad2/release.json');
    const r = JSON.parse(fs.readFileSync(f, 'utf8'));
    r.manifest = r.manifest.replace('"compatibleNativeMax":2', '"compatibleNativeMax":9');
    fs.writeFileSync(f, JSON.stringify(r));
    expect(runFails(['verify-web', '--dir', path.join(dir, 'web-bad2'), '--public-key', path.join(dir, 'pub.pem')])).toMatch(/signature invalid/);
  });

  it('refuses non-zip input and inverted ranges', () => {
    expect(runFails(['web', '--key', path.join(dir, 'k.pem'), '--zip', path.join(dir, 'fake.apk'), '--channel', 'staging', '--native-min', '2', '--native-max', '2', '--out', path.join(dir, 'x')])).toMatch(/not a zip/);
    expect(runFails(['web', '--key', path.join(dir, 'k.pem'), '--zip', path.join(dir, 'dist.zip'), '--channel', 'staging', '--native-min', '3', '--native-max', '2', '--out', path.join(dir, 'x')])).toMatch(/native-min/);
  });

  it('refuses to run without a signing key', () => {
    expect(runFails(['web', '--zip', path.join(dir, 'dist.zip'), '--channel', 'staging', '--native-min', '2', '--native-max', '2', '--out', path.join(dir, 'x')])).toMatch(/signing key missing/);
  });
});

describe('release-tool native', () => {
  it('writes a signed manifest with the APK hash and normalized cert fingerprint', () => {
    run(['native', '--key', path.join(dir, 'k.pem'), '--apk', path.join(dir, 'fake.apk'), '--channel', 'production', '--version-name', '1.2.0',
      '--version-code', '3', '--min-supported', '2', '--signing-cert-sha256', 'AB:'.repeat(31) + 'AB', '--out', path.join(dir, 'native')]);
    const r = JSON.parse(fs.readFileSync(path.join(dir, 'native/release.json'), 'utf8'));
    const pub = fs.readFileSync(path.join(dir, 'pub.pem'));
    expect(crypto.verify('sha256', Buffer.from(r.manifest), pub, Buffer.from(r.signature, 'base64'))).toBe(true);
    const m = JSON.parse(r.manifest);
    expect(m.releaseId).toBe('android-1.2.0-3');
    expect(m.native.signingCertSha256).toBe('ab'.repeat(32));
    expect(m.native.sha256).toBe(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'fake.apk'))).digest('hex'));
    expect(m.native.mandatory).toBe(false);
  });

  it('rejects min-supported above versionCode', () => {
    expect(runFails(['native', '--key', path.join(dir, 'k.pem'), '--apk', path.join(dir, 'fake.apk'), '--channel', 'production', '--version-name', '1.2.0',
      '--version-code', '3', '--min-supported', '4', '--signing-cert-sha256', 'ab'.repeat(32), '--out', path.join(dir, 'y')])).toMatch(/min-supported/);
  });
});
