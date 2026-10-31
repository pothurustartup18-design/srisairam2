#!/usr/bin/env node
/**
 * Local update server for testing app updates over Wi-Fi, with no cloud, S3 or
 * deployment. Serves the same /api/app-updates/* shape as the real backend
 * from the folder written by local-release.mjs (local-releases/<releaseId>/).
 *
 *   node scripts/release/local-update-server.mjs [--port 7353] [--dir local-releases]
 *
 * Test-only: no auth, no rollout, plain HTTP. Signatures are still produced by
 * the release tool and verified by the app exactly as in production.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const PORT = Number(opt('port', '7353'));
const DIR = path.resolve(opt('dir', 'local-releases'));
fs.mkdirSync(DIR, { recursive: true });

const RELEASE_ID_RE = /^[a-z0-9][a-z0-9._-]{2,63}$/;

function loadReleases() {
  const out = [];
  for (const id of fs.readdirSync(DIR)) {
    if (!RELEASE_ID_RE.test(id)) continue;
    try {
      const r = JSON.parse(fs.readFileSync(path.join(DIR, id, 'release.json'), 'utf8'));
      const m = JSON.parse(r.manifest);
      const section = m.native ?? m.web;
      const file = path.join(DIR, id, path.basename(section.artifactKey));
      if (!fs.existsSync(file)) continue;
      out.push({ id, release: r, manifest: m, file, createdAt: Date.parse(m.createdAt) || 0 });
    } catch {
      /* skip incomplete folders */
    }
  }
  return out;
}

const baseUrl = req => `http://${req.headers.host}`;
const offer = (req, r) => ({
  releaseId: r.id,
  manifest: r.release.manifest,
  signature: r.release.signature,
  keyId: r.release.keyId,
  downloadUrl: `${baseUrl(req)}/files/${r.id}/${path.basename(r.file)}`
});

function check(req, q) {
  const channel = q.get('channel') || 'production';
  const versionCode = Number(q.get('versionCode'));
  const bundleId = q.get('bundleId') || 'builtin';
  const all = loadReleases().filter(r => r.manifest.channel === channel);

  const native = all
    .filter(r => r.manifest.kind === 'native' && r.manifest.native.versionCode > versionCode)
    .sort((a, b) => b.manifest.native.versionCode - a.manifest.native.versionCode)[0];
  const minSupported = Math.max(0, ...all.filter(r => r.manifest.native).map(r => r.manifest.native.minimumSupportedVersionCode));

  const live = all
    .filter(r => r.manifest.kind === 'web' && r.manifest.web.compatibleNativeMin <= versionCode && versionCode <= r.manifest.web.compatibleNativeMax)
    .sort((a, b) => b.createdAt - a.createdAt)[0];

  return {
    checkedAt: new Date().toISOString(),
    channel,
    mandatory: !!native && versionCode < minSupported,
    native: native ? offer(req, native) : null,
    liveUpdate: live && live.id !== bundleId ? offer(req, live) : null
  };
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};
const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS });
  res.end(JSON.stringify(body));
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const log = (...a) => console.log(new Date().toLocaleTimeString(), req.method, url.pathname, ...a);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }

  if (req.method === 'GET' && url.pathname === '/api/app-updates/android') {
    const data = check(req, url.searchParams);
    log(`v${url.searchParams.get('versionCode')} bundle=${url.searchParams.get('bundleId')} -> native=${data.native?.releaseId ?? '-'} live=${data.liveUpdate?.releaseId ?? '-'}`);
    return json(res, 200, { success: true, data });
  }

  if (req.method === 'POST' && url.pathname === '/api/app-updates/events') {
    let body = '';
    req.on('data', c => (body += c.toString().slice(0, 4096)));
    req.on('end', () => {
      try {
        const e = JSON.parse(body);
        log(`event ${e.kind}/${e.stage} ${e.releaseId ?? ''} ${e.error ? 'ERR: ' + e.error : ''}`);
      } catch {
        log('event (unparseable)');
      }
      json(res, 202, { success: true });
    });
    return;
  }

  const file = url.pathname.match(/^\/files\/([a-z0-9][a-z0-9._-]{2,63})\/([A-Za-z0-9._-]+)$/);
  if (req.method === 'GET' && file) {
    const target = path.join(DIR, file[1], file[2]);
    if (path.dirname(target) !== path.join(DIR, file[1]) || !fs.existsSync(target)) return json(res, 404, { success: false });
    const size = fs.statSync(target).size;
    log(`(${(size / 1048576).toFixed(1)} MB)`);
    res.writeHead(200, { 'Content-Type': target.endsWith('.apk') ? 'application/vnd.android.package-archive' : 'application/octet-stream', 'Content-Length': size, ...CORS });
    return fs.createReadStream(target).pipe(res);
  }

  // Simple page for first install: open http://<pc-ip>:PORT on the phone.
  if (req.method === 'GET' && url.pathname === '/') {
    const rows = loadReleases()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(r => {
        const n = r.manifest.native;
        const label = n ? `APK v${n.versionName} (code ${n.versionCode})` : `Web bundle`;
        const link = n ? `<a href="/files/${r.id}/${path.basename(r.file)}">download</a>` : '';
        return `<tr><td>${r.id}</td><td>${label}</td><td>${r.manifest.channel}</td><td>${link}</td></tr>`;
      })
      .join('');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(`<!doctype html><meta name=viewport content="width=device-width"><title>Local updates</title>
      <body style="font-family:sans-serif;padding:16px"><h2>Local update server</h2>
      <table border=1 cellpadding=6 style="border-collapse:collapse"><tr><th>Release</th><th>Type</th><th>Channel</th><th></th></tr>${rows || '<tr><td colspan=4>No releases yet</td></tr>'}</table></body>`);
  }

  json(res, 404, { success: false, message: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Local update server on http://0.0.0.0:${PORT}  (releases: ${DIR})`);
  console.log(`${loadReleases().length} release(s) available. Ctrl+C to stop.`);
});
