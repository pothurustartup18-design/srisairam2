#!/usr/bin/env node
/**
 * Runs ON the production server after `git pull`: builds the app-ui web bundle,
 * signs it, uploads it to S3, registers it with the local backend and publishes it
 * to the production channel. Installed apps then show it in Settings -> App Updates.
 *
 *   node scripts/release/server-release.mjs [--force] [--dry-run]
 *
 * Refuses when native files changed since the last release (those need a new APK).
 * Needs: the private signing key (default ~/.schoolhub-release/release-signing-private.pem)
 * and rnd-service/.env (AWS_*, APP_RELEASE_CI_TOKEN). Release state is kept in
 * ~/.schoolhub-release/last-web-release-sha.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = path.resolve(import.meta.dirname, '../..');
const REPO = path.resolve(APP, '..');
const KEYS = path.join(os.homedir(), '.schoolhub-release');
const KEY_FILE = process.env.RELEASE_KEY_FILE || path.join(KEYS, 'release-signing-private.pem');
const STATE = path.join(KEYS, 'last-web-release-sha');
const API = process.env.RELEASE_API_BASE || 'http://127.0.0.1:5000/api';
const NATIVE_RE = /^app-ui\/(android\/|capacitor\.config\.ts|package(-lock)?\.json)/;
const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');

const die = msg => {
  console.error(`\nrelease: ${msg}`);
  process.exit(1);
};
const run = (cmd, args, { cwd = APP, env = {}, capture = false } = {}) => {
  const r = spawnSync(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8' });
  if (r.status !== 0) die(`${cmd} ${args.join(' ')} failed${capture ? `:\n${r.stderr || r.stdout}` : ''}`);
  return (r.stdout || '').trim();
};
const git = (...args) => run('git', args, { cwd: REPO, capture: true });

function readEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}

fs.existsSync(KEY_FILE) || die(`signing key not found at ${KEY_FILE}`);
const be = readEnv(path.join(REPO, 'rnd-service/.env'));
for (const k of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'AWS_BUCKET_NAME', 'APP_RELEASE_CI_TOKEN']) be[k] || die(`${k} missing in rnd-service/.env`);

// ── What changed since the last release? ─────────────────────────────────────
const head = git('rev-parse', 'HEAD');
const short = head.slice(0, 7);
const last = fs.existsSync(STATE) ? fs.readFileSync(STATE, 'utf8').trim() : '';
let notes = 'UI update';
if (last) {
  const changed = git('diff', '--name-only', last, head, '--', 'app-ui').split('\n').filter(Boolean);
  if (changed.length === 0 && !force) die(`no app-ui changes since the last release (${last.slice(0, 7)}). Pull first, or use --force.`);
  const nativeFiles = changed.filter(f => NATIVE_RE.test(f));
  if (nativeFiles.length > 0)
    die(`native files changed since the last release:\n  ${nativeFiles.join('\n  ')}\nA live update cannot ship these: build and distribute a new APK instead.`);
  const subjects = git('log', '--format=%s', `${last}..${head}`, '--', 'app-ui').split('\n').filter(Boolean).slice(0, 8);
  if (subjects.length) notes = subjects.join('|');
}

// ── Build + zip ──────────────────────────────────────────────────────────────
const vc = fs.readFileSync(path.join(APP, 'android/app/version.properties'), 'utf8').match(/^VERSION_CODE=(\d+)/m)?.[1] || die('VERSION_CODE not found');
console.log(`Releasing app-ui @ ${short} (native versionCode ${vc})\nNotes: ${notes.replaceAll('|', ' · ')}\n`);
run('npm', ['ci', '--legacy-peer-deps', '--no-audit', '--no-fund']);
run('npm', ['run', 'build'], { env: { VITE_UPDATE_CHANNEL: 'production' } });
const dist = path.join(APP, 'dist');
fs.existsSync(path.join(dist, 'index.html')) || die('dist/index.html missing after build');

const { zipSync } = await import(createRequire(path.join(APP, 'package.json')).resolve('fflate'));
const files = {};
(function walk(dir, rel = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), r);
    else files[r] = new Uint8Array(fs.readFileSync(path.join(dir, e.name)));
  }
})(dist);
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'app-release-'));
const zip = path.join(work, 'bundle.zip');
fs.writeFileSync(zip, zipSync(files));
fs.writeFileSync(path.join(work, 'notes.txt'), notes);

// ── Sign ─────────────────────────────────────────────────────────────────────
const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const releaseId = `web-${ts}-${short}`;
const out = path.join(work, 'out');
const tool = path.join(APP, 'scripts/release/release-tool.mjs');
run('node', [tool, 'web', '--key', KEY_FILE, '--zip', zip, '--channel', 'production', '--release-id', releaseId,
  '--native-min', vc, '--native-max', vc, '--notes-file', path.join(work, 'notes.txt'), '--out', out]);
run('node', [tool, 'verify-web', '--dir', out, '--public-key', path.join(APP, 'release/keys/release-signing-public.pem')]);
const rel = Object.fromEntries(fs.readFileSync(path.join(out, 'release.env'), 'utf8').split(/\r?\n/).filter(Boolean).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
if (dryRun) {
  console.log(`\nDry run OK: built and signed ${releaseId}. Nothing uploaded or published.`);
  process.exit(0);
}

// ── Upload (immutable, checksum-verified) ────────────────────────────────────
const { S3Client, PutObjectCommand, HeadObjectCommand } = createRequire(path.join(REPO, 'rnd-service/package.json'))('@aws-sdk/client-s3');
const s3 = new S3Client({ region: be.AWS_REGION, credentials: { accessKeyId: be.AWS_ACCESS_KEY_ID, secretAccessKey: be.AWS_SECRET_ACCESS_KEY } });
await s3.send(new PutObjectCommand({ Bucket: be.AWS_BUCKET_NAME, Key: rel.ARTIFACT_KEY, Body: fs.readFileSync(rel.ARTIFACT_PATH), ContentType: 'application/octet-stream', ChecksumSHA256: rel.ARTIFACT_SHA256_B64, IfNoneMatch: '*' }));
const uploaded = await s3.send(new HeadObjectCommand({ Bucket: be.AWS_BUCKET_NAME, Key: rel.ARTIFACT_KEY, ChecksumMode: 'ENABLED' }));
uploaded.ChecksumSHA256 === rel.ARTIFACT_SHA256_B64 || die('uploaded checksum mismatch');
console.log(`Uploaded s3://${be.AWS_BUCKET_NAME}/${rel.ARTIFACT_KEY}`);

// ── Register + publish ───────────────────────────────────────────────────────
const call = async (url, payload) => {
  const r = await fetch(`${API}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Release-Token': be.APP_RELEASE_CI_TOKEN }, body: payload });
  const t = await r.text();
  r.ok || die(`${url} -> ${r.status} ${t}`);
};
await call('/app-updates/admin/releases', fs.readFileSync(path.join(out, 'release.json'), 'utf8'));
await call(`/app-updates/admin/releases/${releaseId}/publish`, JSON.stringify({ rolloutPercent: 100 }));
const check = await (await fetch(`${API}/app-updates/releases/${releaseId}`)).text();
check.includes('"status":"published"') || die(`published release not visible: ${check.slice(0, 200)}`);

fs.writeFileSync(STATE, `${head}\n`);
fs.rmSync(work, { recursive: true, force: true });
console.log(`\nPublished ${releaseId} to production (100%). Phones: Settings -> App Updates -> Check for updates.`);
