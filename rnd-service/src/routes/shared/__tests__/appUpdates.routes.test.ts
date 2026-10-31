import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import crypto from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import type { AddressInfo } from 'net';

/**
 * Route-level integration tests for /api/app-updates against a real MongoDB.
 * Opt-in: set TEST_MONGODB_URI to a THROWAWAY database (the suite drops it).
 * Never point this at production. S3 is mocked.
 */
const TEST_DB = process.env.TEST_MONGODB_URI;

const s3State = { head: new Map<string, { ContentLength: number; ChecksumSHA256: string }>() };
vi.mock('../../../services/s3.service', () => ({
  getS3Client: () => ({
    send: async (cmd: any) => {
      const head = s3State.head.get(cmd.input.Key);
      if (!head) throw Object.assign(new Error('NotFound'), { name: 'NotFound' });
      return head;
    }
  }),
  getPresignedDownloadUrl: async (key: string) => `https://s3.test/${key}?sig=1`
}));

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const CI_TOKEN = crypto.randomBytes(32).toString('hex');
const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest();

let base = '';
let server: any;

function makeRelease(kind: 'native' | 'web', opts: { releaseId: string; versionCode?: number; min?: number; max?: number; minSupported?: number; channel?: string }) {
  const artifact = crypto.randomBytes(2048);
  const artifactKey = kind === 'native' ? `releases/android/${opts.releaseId}/app-release.apk` : `releases/web/${opts.releaseId}/bundle.zip.enc`;
  const m: any = {
    schemaVersion: 1,
    releaseId: opts.releaseId,
    kind,
    channel: opts.channel ?? 'staging',
    packageId: 'com.schoolhub.app',
    createdAt: new Date().toISOString(),
    releaseNotes: ['test']
  };
  if (kind === 'native') {
    m.native = {
      versionName: `1.${opts.versionCode}.0`,
      versionCode: opts.versionCode,
      minimumSupportedVersionCode: opts.minSupported ?? 1,
      mandatory: false,
      artifactKey,
      sha256: sha(artifact).toString('hex'),
      size: artifact.length,
      signingCertSha256: 'ab'.repeat(32)
    };
  } else {
    m.web = {
      bundleId: opts.releaseId,
      compatibleNativeMin: opts.min ?? 2,
      compatibleNativeMax: opts.max ?? 2,
      artifactKey,
      artifactSha256: sha(artifact).toString('hex'),
      size: artifact.length,
      checksum: crypto.randomBytes(256).toString('hex'),
      sessionKey: `${crypto.randomBytes(16).toString('base64')}:${crypto.randomBytes(256).toString('base64')}`
    };
  }
  const manifest = JSON.stringify(m);
  const signature = crypto.sign('sha256', Buffer.from(manifest), privateKey).toString('base64');
  const keyId = sha(publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString('hex').slice(0, 16);
  return { body: { manifest, signature, keyId }, artifactKey, artifact };
}

const api = (path: string, init: RequestInit = {}, ci = false) =>
  fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(ci ? { 'X-Release-Token': CI_TOKEN } : {}), ...(init.headers ?? {}) }
  });

async function registerAndPublish(rel: ReturnType<typeof makeRelease>, rolloutPercent = 100) {
  s3State.head.set(rel.artifactKey, { ContentLength: rel.artifact.length, ChecksumSHA256: sha(rel.artifact).toString('base64') });
  const r1 = await api('/api/app-updates/admin/releases', { method: 'POST', body: JSON.stringify(rel.body) }, true);
  expect(r1.status).toBe(201);
  const id = JSON.parse(rel.body.manifest).releaseId;
  const r2 = await api(`/api/app-updates/admin/releases/${id}/publish`, { method: 'POST', body: JSON.stringify({ rolloutPercent }) }, true);
  expect(r2.status).toBe(200);
  return id;
}

const check = async (q: Record<string, string>) => {
  const res = await api(`/api/app-updates/android?${new URLSearchParams({ channel: 'staging', installId: 'install-test-0001', ...q })}`);
  return { status: res.status, body: (await res.json()) as any };
};

describe.skipIf(!TEST_DB)('app-updates routes (integration)', () => {
  beforeAll(async () => {
    process.env.APP_RELEASE_PUBLIC_KEY = publicKey.export({ type: 'pkcs1', format: 'pem' }).toString();
    process.env.APP_RELEASE_CI_TOKEN = CI_TOKEN;
    await mongoose.connect(TEST_DB!);
    await mongoose.connection.db!.dropDatabase();
    const { default: router } = await import('../appUpdates.routes');
    // Same JWT strategy as production so the no-token path behaves identically.
    const { default: passport } = await import('passport');
    await import('../../../config/passport');
    const app = express();
    app.use(express.json());
    app.use(passport.initialize());
    app.use('/api/app-updates', router);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  it('reports no update when nothing is published', async () => {
    const { status, body } = await check({ versionCode: '2', bundleId: 'builtin' });
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ native: null, liveUpdate: null, mandatory: false });
  });

  it('validates query input', async () => {
    expect((await check({ versionCode: 'abc' })).status).toBe(400);
    expect((await check({ versionCode: '2', channel: 'beta' })).status).toBe(400);
    expect((await check({ versionCode: '2', bundleId: '../x' })).status).toBe(400);
  });

  it('rejects registration without a valid CI token', async () => {
    const rel = makeRelease('web', { releaseId: 'web-auth-0001' });
    const res = await api('/api/app-updates/admin/releases', { method: 'POST', body: JSON.stringify(rel.body), headers: { 'X-Release-Token': 'x'.repeat(64) } });
    expect(res.status).toBe(401);
    const noAuth = await api('/api/app-updates/admin/releases', { method: 'POST', body: JSON.stringify(rel.body) });
    expect(noAuth.status).toBe(401);
  });

  it('rejects a tampered manifest', async () => {
    const rel = makeRelease('web', { releaseId: 'web-tamper-0001' });
    rel.body.manifest = rel.body.manifest.replace('"compatibleNativeMax":2', '"compatibleNativeMax":3');
    const res = await api('/api/app-updates/admin/releases', { method: 'POST', body: JSON.stringify(rel.body) }, true);
    expect(res.status).toBe(400);
  });

  it('refuses to register when the stored artifact is missing or differs', async () => {
    const rel = makeRelease('web', { releaseId: 'web-missing-0001' });
    expect((await api('/api/app-updates/admin/releases', { method: 'POST', body: JSON.stringify(rel.body) }, true)).status).toBe(422);
    s3State.head.set(rel.artifactKey, { ContentLength: rel.artifact.length, ChecksumSHA256: sha(Buffer.from('other')).toString('base64') });
    expect((await api('/api/app-updates/admin/releases', { method: 'POST', body: JSON.stringify(rel.body) }, true)).status).toBe(422);
  });

  it('serves a published compatible live bundle, and nothing once installed', async () => {
    const id = await registerAndPublish(makeRelease('web', { releaseId: 'web-good-0001' }));
    const { body } = await check({ versionCode: '2', bundleId: 'builtin' });
    expect(body.data.liveUpdate).toMatchObject({ releaseId: id, downloadUrl: expect.stringContaining('releases/web/web-good-0001/') });
    expect(typeof body.data.liveUpdate.signature).toBe('string');
    expect((await check({ versionCode: '2', bundleId: id })).body.data.liveUpdate).toBeNull();
  });

  it('does not offer bundles to incompatible native versions', async () => {
    expect((await check({ versionCode: '3', bundleId: 'builtin' })).body.data.liveUpdate).toBeNull();
    expect((await check({ versionCode: '1', bundleId: 'builtin' })).body.data.liveUpdate).toBeNull();
  });

  it('release IDs are immutable', async () => {
    const rel = makeRelease('web', { releaseId: 'web-good-0001' });
    s3State.head.set(rel.artifactKey, { ContentLength: rel.artifact.length, ChecksumSHA256: sha(rel.artifact).toString('base64') });
    expect((await api('/api/app-updates/admin/releases', { method: 'POST', body: JSON.stringify(rel.body) }, true)).status).toBe(409);
  });

  it('pausing stops the offer; re-promoting an older bundle rolls clients back', async () => {
    const bad = await registerAndPublish(makeRelease('web', { releaseId: 'web-bad-0002' }));
    expect((await check({ versionCode: '2', bundleId: 'builtin' })).body.data.liveUpdate.releaseId).toBe(bad);

    await api(`/api/app-updates/admin/releases/${bad}/pause`, { method: 'POST', body: '{}' }, true);
    expect((await check({ versionCode: '2', bundleId: 'builtin' })).body.data.liveUpdate.releaseId).toBe('web-good-0001');

    await api(`/api/app-updates/admin/releases/${bad}/publish`, { method: 'POST', body: '{"rolloutPercent":100}' }, true);
    await api('/api/app-updates/admin/releases/web-good-0001/publish', { method: 'POST', body: '{"rolloutPercent":100}' }, true);
    // A device on the bad bundle is moved back to the known-good one.
    expect((await check({ versionCode: '2', bundleId: bad })).body.data.liveUpdate.releaseId).toBe('web-good-0001');
  });

  it('native: offers newer APKs only, enforces increasing versionCode, flags mandatory', async () => {
    const id3 = await registerAndPublish(makeRelease('native', { releaseId: 'android-1.3.0-3', versionCode: 3 }));
    expect((await check({ versionCode: '2' })).body.data.native.releaseId).toBe(id3);
    expect((await check({ versionCode: '3' })).body.data.native).toBeNull();

    const lower = makeRelease('native', { releaseId: 'android-1.2.0-2', versionCode: 2 });
    s3State.head.set(lower.artifactKey, { ContentLength: lower.artifact.length, ChecksumSHA256: sha(lower.artifact).toString('base64') });
    expect((await api('/api/app-updates/admin/releases', { method: 'POST', body: JSON.stringify(lower.body) }, true)).status).toBe(409);

    await registerAndPublish(makeRelease('native', { releaseId: 'android-1.4.0-4', versionCode: 4, minSupported: 3 }), 1);
    const old = await check({ versionCode: '2' });
    expect(old.body.data).toMatchObject({ mandatory: true, native: { releaseId: 'android-1.4.0-4' } });
  });

  it('revoked releases cannot be re-published', async () => {
    await api('/api/app-updates/admin/releases/web-bad-0002/revoke', { method: 'POST', body: '{}' }, true);
    const res = await api('/api/app-updates/admin/releases/web-bad-0002/publish', { method: 'POST', body: '{"rolloutPercent":100}' }, true);
    expect(res.status).toBe(409);
    expect((await api('/api/app-updates/releases/web-bad-0002')).status).toBe(404);
  });

  it('records valid telemetry and rejects invalid events', async () => {
    const ok = await api('/api/app-updates/events', {
      method: 'POST',
      body: JSON.stringify({ installId: 'install-test-0001', kind: 'web', stage: 'activated', releaseId: 'web-good-0001', versionCode: 2 })
    });
    expect(ok.status).toBe(202);
    const bad = await api('/api/app-updates/events', { method: 'POST', body: JSON.stringify({ installId: 'x', kind: 'web', stage: 'hacked' }) });
    expect(bad.status).toBe(400);
    const list = (await (await api('/api/app-updates/admin/releases?channel=staging', {}, true)).json()) as any;
    expect(list.data.find((r: any) => r.releaseId === 'web-good-0001').events).toMatchObject({ activated: 1 });
  });
});
