#!/usr/bin/env node
/**
 * One-command local publishing for Wi-Fi testing (no cloud, no deployment).
 * Writes signed releases to local-releases/, which local-update-server.mjs serves.
 *
 *   node scripts/release/local-release.mjs web    [--notes "A|B"]   frontend-only change → live update
 *   node scripts/release/local-release.mjs native [--notes "A|B"]   native change → bumps versionCode, builds signed APK, publishes it
 *   node scripts/release/local-release.mjs base                     build the first APK to install by hand (no bump, no publish)
 *   node scripts/release/local-release.mjs list
 *   node scripts/release/local-release.mjs remove <releaseId>       withdraw a release (rollback)
 *
 * Options: --ip <lan-ip> (default: auto-detected)  --api-port 7351  --update-port 7353
 * Signing uses the real release key in %USERPROFILE%\.schoolhub-release (never copied into the repo).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const KEYS = path.join(os.homedir(), '.schoolhub-release');
const OUT = path.join(ROOT, 'local-releases');
const VERSION_FILE = path.join(ROOT, 'android/app/version.properties');
const TOOL = path.join(ROOT, 'scripts/release/release-tool.mjs');

const [command, ...rest] = process.argv.slice(2);
const opts = {};
const positional = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) opts[rest[i].slice(2)] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
  else positional.push(rest[i]);
}

const die = msg => {
  console.error(`local-release: ${msg}`);
  process.exit(1);
};

function run(cmd, args, { cwd = ROOT, env = {}, capture = false } = {}) {
  const r = spawnSync(cmd, args, { cwd, env: { ...process.env, ...env }, shell: true, stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8' });
  if (r.status !== 0) die(`${cmd} ${args.join(' ')} failed${capture ? `:\n${r.stderr || r.stdout}` : ''}`);
  return r.stdout;
}

function lanIp() {
  if (opts.ip && opts.ip !== true) return opts.ip;
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (/vEthernet|Loopback|WSL|VirtualBox|VMware|Bluetooth/i.test(name)) continue;
    for (const a of addrs ?? []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) return a.address;
  }
  return die('could not detect LAN IP; pass --ip <address>');
}

const readVersion = () => Object.fromEntries(fs.readFileSync(VERSION_FILE, 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => l.split('=')));
function writeVersion(code, name) {
  let s = fs.readFileSync(VERSION_FILE, 'utf8');
  s = s.replace(/^VERSION_CODE=.*$/m, `VERSION_CODE=${code}`).replace(/^VERSION_NAME=.*$/m, `VERSION_NAME=${name}`);
  fs.writeFileSync(VERSION_FILE, s);
}

function buildEnv() {
  const ip = lanIp();
  const apiPort = opts['api-port'] || '7351';
  const updatePort = opts['update-port'] || '7353';
  return { ip, updatePort, env: { VITE_API_URL: `http://${ip}:${apiPort}/api`, VITE_UPDATE_CHANNEL: 'staging', VITE_UPDATE_SERVER_PORT: updatePort } };
}

function notesFile(dir) {
  const f = path.join(dir, 'notes.txt');
  fs.writeFileSync(f, typeof opts.notes === 'string' ? opts.notes : 'Local test update');
  return f;
}

function publish(releaseOutDir) {
  const env = Object.fromEntries(fs.readFileSync(path.join(releaseOutDir, 'release.env'), 'utf8').split(/\r?\n/).filter(Boolean).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  const dest = path.join(OUT, env.RELEASE_ID);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.copyFileSync(path.join(releaseOutDir, 'release.json'), path.join(dest, 'release.json'));
  fs.copyFileSync(env.ARTIFACT_PATH, path.join(dest, path.basename(env.ARTIFACT_KEY)));
  return env.RELEASE_ID;
}

const keyPath = path.join(KEYS, 'release-signing-private.pem');
const needKey = () => fs.existsSync(keyPath) || die(`release key not found at ${keyPath}`);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'localrel-'));

function cmdWeb() {
  needKey();
  const { ip, env } = buildEnv();
  const { VERSION_CODE: vc } = readVersion();
  console.log(`Building web bundle (API http://${ip}:${opts['api-port'] || 7351}/api, native ${vc})…`);
  run('npm', ['run', 'build'], { env });
  const work = tmp();
  const zip = path.join(work, 'bundle.zip');
  // bsdtar writes a zip with forward-slash paths (Compress-Archive in PS 5.1 does not).
  // Windows' own bsdtar: GNU tar from Git Bash treats "C:\…" as a remote host.
  const tarBin = process.platform === 'win32' ? `"${path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe')}"` : 'tar';
  // List the top-level entries explicitly: "tar ... ." stores them as "./index.html", which the app's updater rejects.
  const topLevel = fs.readdirSync('dist').map(n => `"${n}"`);
  run(tarBin, ['-a', '-c', '-f', `"${zip}"`, '-C', '"dist"', ...topLevel]);
  const out = path.join(work, 'out');
  run('node', [`"${TOOL}"`, 'web', '--key', `"${keyPath}"`, '--zip', `"${zip}"`, '--channel', 'staging', '--native-min', String(opts['native-min'] || vc), '--native-max', vc, '--notes-file', `"${notesFile(work)}"`, '--out', `"${out}"`]);
  const id = publish(out);
  console.log(`\nPublished ${id}. On the phone: Settings → App Updates → Check for updates → Update now → Restart & apply.`);
}

function sdkTool(name) {
  const bt = path.join(process.env.LOCALAPPDATA ?? '', 'Android/Sdk/build-tools');
  const ver = fs.existsSync(bt) ? fs.readdirSync(bt).sort().pop() : null;
  return ver ? path.join(bt, ver, name) : die('Android SDK build-tools not found');
}

function buildApk(ip, env, updatePort) {
  console.log(`Building signed release APK (API http://${ip}:${opts['api-port'] || 7351}/api, updates http://${ip}:${updatePort})…`);
  run('npm', ['run', 'build'], { env });
  run('npx', ['cap', 'sync', 'android'], { env: { CAPACITOR_TELEMETRY: '0', CAPACITOR_LOCAL_HTTP: '1' } });
  const jdk = process.env.JAVA_HOME || 'C:\\Program Files\\Microsoft\\jdk-21.0.12.101-hotspot';
  run(`"${path.join(ROOT, 'android', 'gradlew.bat')}"`, ['assembleRelease', '-PallowHttpUpdates=true'], {
    cwd: path.join(ROOT, 'android'),
    env: { JAVA_HOME: jdk, ANDROID_KEYSTORE_PROPERTIES: path.join(KEYS, 'keystore.properties') }
  });
  const apk = path.join(ROOT, 'android/app/build/outputs/apk/release/app-release.apk');
  fs.existsSync(apk) || die('signed APK was not produced (keystore missing?)');
  const certs = run(`"${sdkTool('apksigner.bat')}"`, ['verify', '--print-certs', `"${apk}"`], { capture: true });
  const cert = certs.match(/certificate SHA-256 digest: ([0-9a-f]{64})/)?.[1];
  cert || die('could not read APK signing certificate');
  return { apk, cert };
}

function cmdNative(isBase) {
  needKey();
  const { ip, updatePort, env } = buildEnv();
  const v = readVersion();
  if (!isBase) {
    const code = Number(v.VERSION_CODE) + 1;
    const [maj, min] = v.VERSION_NAME.split('.');
    writeVersion(code, `${maj}.${min}.${code}`);
  }
  const now = readVersion();
  const { apk, cert } = buildApk(ip, env, updatePort);

  const copy = path.join(ROOT, '..', `SchoolHub-local-v${now.VERSION_CODE}.apk`);
  fs.copyFileSync(apk, copy);
  if (isBase) {
    console.log(`\nBase APK: ${copy}\nInstall it on the phone once (uninstall the old app first if it was signed differently).`);
    return;
  }
  const work = tmp();
  const out = path.join(work, 'out');
  run('node', [`"${TOOL}"`, 'native', '--key', `"${keyPath}"`, '--apk', `"${apk}"`, '--channel', 'staging', '--version-name', now.VERSION_NAME, '--version-code', now.VERSION_CODE,
    '--min-supported', '1', '--signing-cert-sha256', cert, '--notes-file', `"${notesFile(work)}"`, '--out', `"${out}"`]);
  const id = publish(out);
  console.log(`\nPublished ${id} (APK also at ${copy}).\nOn the phone: Settings → App Updates → Check for updates → Update now → Install update.`);
}

function cmdList() {
  if (!fs.existsSync(OUT)) return console.log('No local releases.');
  for (const id of fs.readdirSync(OUT)) {
    try {
      const m = JSON.parse(JSON.parse(fs.readFileSync(path.join(OUT, id, 'release.json'), 'utf8')).manifest);
      console.log(`${id}\t${m.kind}\t${m.channel}\t${m.createdAt}`);
    } catch {
      /* ignore */
    }
  }
}

function cmdRemove() {
  const id = positional[0];
  if (!id || !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(id)) die('usage: remove <releaseId>');
  const dir = path.join(OUT, id);
  fs.existsSync(dir) || die(`no such release: ${id}`);
  fs.rmSync(dir, { recursive: true });
  console.log(`Removed ${id}. Devices will be offered the next newest compatible release instead.`);
}

if (command === 'web') cmdWeb();
else if (command === 'native') cmdNative(false);
else if (command === 'base') cmdNative(true);
else if (command === 'list') cmdList();
else if (command === 'remove') cmdRemove();
else die('usage: local-release.mjs <web|native|base|list|remove> [options]');
