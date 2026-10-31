import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { AppRelease, IAppRelease, ReleaseStatus } from '../../models/appRelease.model';
import { AppUpdateEvent, UPDATE_EVENT_STAGES } from '../../models/appUpdateEvent.model';
import { authenticateJWT } from '../../middlewares/auth.middleware';
import { getS3Client, getPresignedDownloadUrl } from '../../services/s3.service';
import {
  CHANNELS,
  Channel,
  DEFAULT_PACKAGE_ID,
  INSTALL_ID_RE,
  RELEASE_ID_RE,
  ManifestError,
  computeKeyId,
  hexToBase64,
  parseManifest,
  selectLiveUpdate,
  selectNativeUpdate,
  tokensMatch,
  verifyManifestSignature
} from '../../services/appRelease.service';

/**
 * Android app update API (see rnd-ui/docs/APP_UPDATES.md).
 *
 * Public (no login needed, so the app can check before/without a session):
 *   GET  /api/app-updates/android            – compatible updates for this install
 *   GET  /api/app-updates/releases/:id       – signed manifest of a published release
 *   POST /api/app-updates/events             – lifecycle telemetry (no personal data)
 *
 * Release management (CI token or superadmin JWT):
 *   GET  /api/app-updates/admin/releases
 *   POST /api/app-updates/admin/releases                 – register a signed draft
 *   POST /api/app-updates/admin/releases/:id/publish     – publish / promote / set rollout
 *   POST /api/app-updates/admin/releases/:id/pause
 *   POST /api/app-updates/admin/releases/:id/revoke
 */

const router = Router();

const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;
const packageId = () => process.env.APP_RELEASE_PACKAGE_ID || DEFAULT_PACKAGE_ID;

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many update requests. Please retry shortly.' }
});

const parseIntParam = (v: unknown, min: number, max: number): number | null => {
  if (typeof v !== 'string' || !/^\d{1,10}$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
};

const signedPayload = (r: IAppRelease) => ({
  releaseId: r.releaseId,
  manifest: r.manifest,
  signature: r.signature,
  keyId: r.keyId
});

// ─── Public: update check ─────────────────────────────────────────────────────

router.get('/android', publicLimiter, async (req: Request, res: Response) => {
  const channel = (req.query.channel ?? 'production') as Channel;
  const versionCode = parseIntParam(req.query.versionCode, 1, 2100000000);
  const bundleId = typeof req.query.bundleId === 'string' ? req.query.bundleId : 'builtin';
  const installId = typeof req.query.installId === 'string' ? req.query.installId : undefined;

  if (!CHANNELS.includes(channel)) return res.status(400).json({ success: false, message: 'Invalid channel.' });
  if (versionCode === null) return res.status(400).json({ success: false, message: 'versionCode must be a positive integer.' });
  if (bundleId !== 'builtin' && !RELEASE_ID_RE.test(bundleId)) return res.status(400).json({ success: false, message: 'Invalid bundleId.' });
  if (installId !== undefined && !INSTALL_ID_RE.test(installId)) return res.status(400).json({ success: false, message: 'Invalid installId.' });

  try {
    const [natives, webs] = await Promise.all([
      AppRelease.find({ kind: 'native', channel, status: 'published' }),
      AppRelease.find({
        kind: 'web',
        channel,
        status: 'published',
        compatibleNativeMin: { $lte: versionCode },
        compatibleNativeMax: { $gte: versionCode }
      })
    ]);

    const nativeSel = selectNativeUpdate(natives, versionCode, installId);
    const live = selectLiveUpdate(webs, versionCode, bundleId, installId);

    const nativeOut = nativeSel.release
      ? {
          ...signedPayload(nativeSel.release),
          downloadUrl: await getPresignedDownloadUrl(nativeSel.release.artifactKey, DOWNLOAD_URL_TTL_SECONDS)
        }
      : null;
    const liveOut = live
      ? { ...signedPayload(live), downloadUrl: await getPresignedDownloadUrl(live.artifactKey, DOWNLOAD_URL_TTL_SECONDS) }
      : null;

    res.set('Cache-Control', 'no-store');
    return res.json({
      success: true,
      data: {
        checkedAt: new Date().toISOString(),
        channel,
        mandatory: nativeSel.mandatory,
        native: nativeOut,
        liveUpdate: liveOut
      }
    });
  } catch (err: any) {
    console.error('[AppUpdates] update check failed:', err.message);
    return res.status(500).json({ success: false, message: 'Update check failed.' });
  }
});

router.get('/releases/:releaseId', publicLimiter, async (req: Request, res: Response) => {
  if (!RELEASE_ID_RE.test(req.params.releaseId)) return res.status(400).json({ success: false, message: 'Invalid releaseId.' });
  try {
    const release = await AppRelease.findOne({ releaseId: req.params.releaseId, status: 'published' });
    if (!release) return res.status(404).json({ success: false, message: 'Release not found.' });
    return res.json({ success: true, data: { ...signedPayload(release), status: release.status } });
  } catch (err: any) {
    console.error('[AppUpdates] release lookup failed:', err.message);
    return res.status(500).json({ success: false, message: 'Release lookup failed.' });
  }
});

// ─── Public: telemetry ────────────────────────────────────────────────────────

router.post('/events', publicLimiter, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const problems: string[] = [];
  if (typeof b.installId !== 'string' || !INSTALL_ID_RE.test(b.installId)) problems.push('installId');
  if (b.kind !== 'native' && b.kind !== 'web') problems.push('kind');
  if (!UPDATE_EVENT_STAGES.includes(b.stage)) problems.push('stage');
  if (b.releaseId !== undefined && (typeof b.releaseId !== 'string' || !RELEASE_ID_RE.test(b.releaseId))) problems.push('releaseId');
  if (b.bundleId !== undefined && (typeof b.bundleId !== 'string' || (b.bundleId !== 'builtin' && !RELEASE_ID_RE.test(b.bundleId)))) problems.push('bundleId');
  if (b.channel !== undefined && !CHANNELS.includes(b.channel)) problems.push('channel');
  if (b.versionCode !== undefined && !(Number.isInteger(b.versionCode) && b.versionCode > 0)) problems.push('versionCode');
  if (b.error !== undefined && typeof b.error !== 'string') problems.push('error');
  if (problems.length) return res.status(400).json({ success: false, message: `Invalid fields: ${problems.join(', ')}` });

  try {
    await AppUpdateEvent.create({
      installId: b.installId,
      kind: b.kind,
      stage: b.stage,
      releaseId: b.releaseId,
      channel: b.channel,
      versionCode: b.versionCode,
      bundleId: b.bundleId,
      error: typeof b.error === 'string' ? b.error.slice(0, 500) : undefined
    });
    return res.status(202).json({ success: true });
  } catch (err: any) {
    console.error('[AppUpdates] event write failed:', err.message);
    return res.status(500).json({ success: false, message: 'Event not recorded.' });
  }
});

// ─── Release management ───────────────────────────────────────────────────────

/**
 * CI authenticates with `X-Release-Token` (APP_RELEASE_CI_TOKEN); humans need a
 * superadmin JWT. Nothing else can register or change releases.
 */
const requireReleaseManager = (req: Request, res: Response, next: NextFunction) => {
  const ciToken = req.header('x-release-token');
  if (ciToken !== undefined) {
    if (tokensMatch(ciToken, process.env.APP_RELEASE_CI_TOKEN)) {
      (req as any).releaseActor = 'ci';
      return next();
    }
    return res.status(401).json({ success: false, message: 'Invalid release token.' });
  }
  return authenticateJWT(req, res, (err?: unknown) => {
    if (err) return next(err);
    const user = req.user as any;
    if (user?.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'Only superadmins can manage app releases.' });
    }
    (req as any).releaseActor = `user:${user.username ?? user._id}`;
    return next();
  });
};

router.get('/admin/releases', requireReleaseManager, async (req: Request, res: Response) => {
  const filter: Record<string, string> = {};
  if (typeof req.query.channel === 'string' && CHANNELS.includes(req.query.channel as Channel)) filter.channel = req.query.channel;
  if (req.query.kind === 'native' || req.query.kind === 'web') filter.kind = req.query.kind;
  try {
    const releases = await AppRelease.find(filter).sort({ createdAt: -1 }).limit(100).select('-manifest -signature').lean();
    const stats = await AppUpdateEvent.aggregate([
      { $match: { releaseId: { $in: releases.map(r => r.releaseId) } } },
      { $group: { _id: { releaseId: '$releaseId', stage: '$stage' }, count: { $sum: 1 } } }
    ]);
    const byRelease: Record<string, Record<string, number>> = {};
    for (const s of stats) (byRelease[s._id.releaseId] ??= {})[s._id.stage] = s.count;
    return res.json({ success: true, data: releases.map(r => ({ ...r, events: byRelease[r.releaseId] ?? {} })) });
  } catch (err: any) {
    console.error('[AppUpdates] list failed:', err.message);
    return res.status(500).json({ success: false, message: 'Could not list releases.' });
  }
});

router.post('/admin/releases', requireReleaseManager, async (req: Request, res: Response) => {
  const publicKey = process.env.APP_RELEASE_PUBLIC_KEY?.replace(/\\n/g, '\n');
  if (!publicKey) return res.status(503).json({ success: false, message: 'APP_RELEASE_PUBLIC_KEY is not configured on the server.' });

  const { manifest, signature, keyId } = req.body ?? {};
  if (typeof manifest !== 'string' || manifest.length > 20000 || typeof signature !== 'string' || typeof keyId !== 'string') {
    return res.status(400).json({ success: false, message: 'manifest, signature and keyId are required strings.' });
  }
  if (keyId !== computeKeyId(publicKey)) return res.status(400).json({ success: false, message: 'Unknown signing key.' });
  if (!verifyManifestSignature(manifest, signature, publicKey)) {
    return res.status(400).json({ success: false, message: 'Manifest signature verification failed.' });
  }

  let m;
  try {
    m = parseManifest(manifest, packageId());
  } catch (err) {
    if (err instanceof ManifestError) return res.status(400).json({ success: false, message: err.message });
    throw err;
  }

  try {
    if (await AppRelease.exists({ releaseId: m.releaseId })) {
      return res.status(409).json({ success: false, message: `Release ${m.releaseId} already exists; release IDs are immutable.` });
    }
    if (m.native) {
      const highest = await AppRelease.findOne({ kind: 'native', channel: m.channel }).sort({ versionCode: -1 }).select('versionCode');
      if (highest?.versionCode && m.native.versionCode <= highest.versionCode) {
        return res.status(409).json({
          success: false,
          message: `versionCode ${m.native.versionCode} must be greater than the highest registered (${highest.versionCode}).`
        });
      }
    }

    // Publish only artifacts that exist in storage and match the signed hash.
    const artifactKey = m.native?.artifactKey ?? m.web!.artifactKey;
    const expectedSha = m.native?.sha256 ?? m.web!.artifactSha256;
    const expectedSize = m.native?.size ?? m.web!.size;
    let head;
    try {
      head = await getS3Client().send(
        new HeadObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key: artifactKey, ChecksumMode: 'ENABLED' })
      );
    } catch {
      return res.status(422).json({ success: false, message: `Artifact ${artifactKey} not found in release storage.` });
    }
    if (head.ContentLength !== expectedSize) {
      return res.status(422).json({ success: false, message: 'Stored artifact size does not match the manifest.' });
    }
    if (head.ChecksumSHA256 !== hexToBase64(expectedSha)) {
      return res.status(422).json({
        success: false,
        message: 'Stored artifact SHA-256 is missing or does not match the manifest (upload with --checksum-algorithm SHA256).'
      });
    }

    const actor = (req as any).releaseActor as string;
    const release = await AppRelease.create({
      releaseId: m.releaseId,
      kind: m.kind,
      channel: m.channel,
      packageId: m.packageId,
      status: 'draft',
      rolloutPercent: 0,
      manifest,
      signature,
      keyId,
      artifactKey,
      versionCode: m.native?.versionCode,
      minimumSupportedVersionCode: m.native?.minimumSupportedVersionCode,
      compatibleNativeMin: m.web?.compatibleNativeMin,
      compatibleNativeMax: m.web?.compatibleNativeMax,
      registeredBy: actor,
      statusHistory: [{ status: 'draft', rolloutPercent: 0, by: actor, at: new Date() }]
    });
    return res.status(201).json({ success: true, data: { releaseId: release.releaseId, status: release.status } });
  } catch (err: any) {
    console.error('[AppUpdates] register failed:', err.message);
    return res.status(500).json({ success: false, message: 'Could not register release.' });
  }
});

const changeStatus = (status: ReleaseStatus) => async (req: Request, res: Response) => {
  if (!RELEASE_ID_RE.test(req.params.releaseId)) return res.status(400).json({ success: false, message: 'Invalid releaseId.' });

  let rolloutPercent: number | undefined;
  if (status === 'published') {
    const raw = req.body?.rolloutPercent ?? 100;
    if (!Number.isInteger(raw) || raw < 1 || raw > 100) {
      return res.status(400).json({ success: false, message: 'rolloutPercent must be an integer from 1 to 100.' });
    }
    rolloutPercent = raw;
  }

  try {
    const release = await AppRelease.findOne({ releaseId: req.params.releaseId });
    if (!release) return res.status(404).json({ success: false, message: 'Release not found.' });
    if (release.status === 'revoked') return res.status(409).json({ success: false, message: 'Revoked releases cannot be changed.' });

    release.status = status;
    if (rolloutPercent !== undefined) release.rolloutPercent = rolloutPercent;
    // Promoting (again) makes a web bundle the channel target — this is how a
    // known-good bundle is rolled back to. Pure rollout changes keep the order.
    if (status === 'published' && req.body?.promote !== false) release.promotedAt = new Date();
    release.statusHistory.push({ status, rolloutPercent: release.rolloutPercent, by: (req as any).releaseActor, at: new Date() });
    await release.save();
    return res.json({
      success: true,
      data: { releaseId: release.releaseId, status: release.status, rolloutPercent: release.rolloutPercent, promotedAt: release.promotedAt }
    });
  } catch (err: any) {
    console.error('[AppUpdates] status change failed:', err.message);
    return res.status(500).json({ success: false, message: 'Could not update release.' });
  }
};

router.post('/admin/releases/:releaseId/publish', requireReleaseManager, changeStatus('published'));
router.post('/admin/releases/:releaseId/pause', requireReleaseManager, changeStatus('paused'));
router.post('/admin/releases/:releaseId/revoke', requireReleaseManager, changeStatus('revoked'));

export default router;
