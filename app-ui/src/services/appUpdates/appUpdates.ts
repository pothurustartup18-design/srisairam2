import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { API_BASE } from '../../constants';
import { ApkUpdater } from './apkUpdater';
import {
  OfferRejected,
  validateOffer,
  verifyManifestSignature,
  type InstalledVersion,
  type SignedRelease,
  type UpdateChannel
} from './manifest';
import { isStartupCheckDue, type Dismissal, type StartupCheckRecord, type UpdateOffer } from './updateState';

/**
 * Side-effecting half of the Android update system (see docs/APP_UPDATES.md).
 *
 * Live (web) bundles go through @capgo/capacitor-updater in manual mode: the
 * plugin downloads to its own staging area, verifies the RSA-signed checksum
 * natively, and rolls back automatically if a new bundle never calls
 * notifyAppReady(). Native APKs go through the local ApkUpdater plugin and
 * Android's own package installer.
 *
 * Nothing here may break normal ERP use: every network/plugin failure is
 * caught and surfaced as an update error only.
 */

export const isNativeApp = Capacitor.isNativePlatform();
export const UPDATE_CHANNEL: UpdateChannel = import.meta.env.VITE_UPDATE_CHANNEL === 'staging' ? 'staging' : 'production';

/**
 * Where update checks/telemetry go. Normally the main API. Local test builds
 * set VITE_UPDATE_SERVER_PORT so checks go to the local update server
 * (scripts/release/local-update-server.mjs) on the same host as the API —
 * which also follows a server URL changed on the login page.
 */
function resolveUpdateApiBase(): string {
  const port = import.meta.env.VITE_UPDATE_SERVER_PORT;
  if (!port) return API_BASE;
  try {
    const u = new URL(API_BASE);
    return `${u.protocol}//${u.hostname}:${port}/api`;
  } catch {
    return API_BASE;
  }
}
const UPDATE_API_BASE = resolveUpdateApiBase();

const LS = {
  installId: 'schoolhub.update.installId',
  pending: 'schoolhub.update.pending',
  lastResult: 'schoolhub.update.lastResult',
  dismissal: 'schoolhub.update.dismissal',
  startupCheck: 'schoolhub.update.startupCheck',
  lastCheckedAt: 'schoolhub.update.lastCheckedAt',
  previousBundle: 'schoolhub.update.previousBundle'
} as const;

// ─── small storage helpers (storage can be unavailable; never throw) ─────────

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: features degrade, app keeps working */
  }
}

export function getInstallId(): string {
  let id = readJson<string>(LS.installId);
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    writeJson(LS.installId, id);
  }
  return id;
}

export const getDismissal = () => readJson<Dismissal>(LS.dismissal);
export const setDismissal = (d: Dismissal | null) => writeJson(LS.dismissal, d);
export const getLastCheckedAt = () => readJson<string>(LS.lastCheckedAt);

// ─── telemetry ───────────────────────────────────────────────────────────────

type EventStage =
  | 'check'
  | 'download_started'
  | 'download_failed'
  | 'verify_failed'
  | 'ready'
  | 'activated'
  | 'rollback'
  | 'apk_install_launched'
  | 'apk_installed'
  | 'apk_cancelled'
  | 'failed';

export function reportEvent(
  kind: 'native' | 'web',
  stage: EventStage,
  extra: { releaseId?: string; versionCode?: number; bundleId?: string; error?: string } = {}
): void {
  if (!isNativeApp) return;
  try {
    void fetch(`${UPDATE_API_BASE}/app-updates/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        installId: getInstallId(),
        kind,
        stage,
        channel: UPDATE_CHANNEL,
        ...extra,
        error: extra.error?.slice(0, 500)
      })
    }).catch(() => {});
  } catch {
    /* telemetry must never affect the app */
  }
}

// ─── installed version ───────────────────────────────────────────────────────

export async function getInstalledVersion(): Promise<InstalledVersion | null> {
  if (!isNativeApp) return null;
  const info = await CapApp.getInfo();
  let bundleId = 'builtin';
  try {
    const current = await CapacitorUpdater.current();
    if (current.bundle.id !== 'builtin') bundleId = current.bundle.version;
  } catch {
    /* plugin unavailable: treat as built-in bundle */
  }
  return { versionName: info.version, versionCode: Number(info.build), bundleId };
}

// ─── checking ────────────────────────────────────────────────────────────────

interface CheckResponse {
  success: boolean;
  data?: {
    checkedAt: string;
    mandatory: boolean;
    native: SignedRelease | null;
    liveUpdate: SignedRelease | null;
  };
  message?: string;
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

async function toOffer(
  release: SignedRelease,
  kind: 'native' | 'web',
  installed: InstalledVersion,
  mandatory: boolean
): Promise<UpdateOffer | null> {
  if (!(await verifyManifestSignature(release))) {
    reportEvent(kind, 'verify_failed', { releaseId: release.releaseId, error: 'manifest signature invalid' });
    return null;
  }
  try {
    const manifest = validateOffer(release, kind, installed, UPDATE_CHANNEL);
    const versionLabel = kind === 'native' ? `v${manifest.native!.versionName}` : `v${installed.versionName} · ${manifest.web!.bundleId}`;
    return {
      kind,
      release,
      manifest,
      mandatory: kind === 'native' && (mandatory || manifest.native!.mandatory),
      versionLabel,
      sizeBytes: manifest.native?.size ?? manifest.web!.size,
      notes: manifest.releaseNotes
    };
  } catch (err) {
    if (err instanceof OfferRejected) {
      reportEvent(kind, 'verify_failed', { releaseId: release.releaseId, error: err.message });
      return null;
    }
    throw err;
  }
}

/**
 * Asks the backend what this install may update to and returns at most one
 * verified offer. A newer native APK wins over a live bundle because it
 * already contains the latest web code.
 */
export async function checkForUpdates(installed: InstalledVersion): Promise<{ offer: UpdateOffer | null; checkedAt: string }> {
  const params = new URLSearchParams({
    channel: UPDATE_CHANNEL,
    versionCode: String(installed.versionCode),
    bundleId: installed.bundleId,
    installId: getInstallId()
  });
  const res = await fetchWithTimeout(`${UPDATE_API_BASE}/app-updates/android?${params}`, 15000);
  const body = (await res.json().catch(() => null)) as CheckResponse | null;
  if (!res.ok || !body?.success || !body.data) throw new Error(body?.message || `Update server returned ${res.status}`);

  const { native, liveUpdate, mandatory, checkedAt } = body.data;
  const offer =
    (native && (await toOffer(native, 'native', installed, mandatory))) ||
    (liveUpdate && (await toOffer(liveUpdate, 'web', installed, false))) ||
    null;
  writeJson(LS.lastCheckedAt, checkedAt);
  reportEvent(offer?.kind ?? 'web', 'check', { versionCode: installed.versionCode, bundleId: installed.bundleId, releaseId: offer?.release.releaseId });
  return { offer, checkedAt };
}

/** Throttled background check (6h, exponential backoff on failure). */
export async function startupCheck(): Promise<UpdateOffer | null> {
  if (!isNativeApp) return null;
  const now = Date.now();
  const record = readJson<StartupCheckRecord>(LS.startupCheck);
  if (!isStartupCheckDue(record, now)) return null;
  try {
    const installed = await getInstalledVersion();
    if (!installed) return null;
    const { offer } = await checkForUpdates(installed);
    writeJson(LS.startupCheck, { lastAttemptAt: now, consecutiveFailures: 0 });
    return offer;
  } catch {
    writeJson(LS.startupCheck, { lastAttemptAt: now, consecutiveFailures: (record?.consecutiveFailures ?? 0) + 1 });
    return null;
  }
}

// ─── live (web) bundles ──────────────────────────────────────────────────────

interface PendingUpdate {
  kind: 'native' | 'web';
  releaseId: string;
  bundleId?: string;
  previousBundleId?: string;
  versionCode?: number;
  mode?: 'now' | 'next';
  at: number;
}

/** Downloads + verifies a live bundle into the plugin's staging area. Returns the bundle id. */
export async function downloadLiveBundle(offer: UpdateOffer, onProgress: (p: number | null) => void): Promise<string> {
  const web = offer.manifest.web!;
  if (!offer.release.downloadUrl) throw new Error('Download link missing; check for updates again.');
  reportEvent('web', 'download_started', { releaseId: web.bundleId });
  const listener = await CapacitorUpdater.addListener('download', e => onProgress(typeof e.percent === 'number' ? e.percent : null));
  try {
    const bundle = await CapacitorUpdater.download({
      url: offer.release.downloadUrl,
      version: web.bundleId,
      checksum: web.checksum,
      sessionKey: web.sessionKey
    });
    reportEvent('web', 'ready', { releaseId: web.bundleId });
    return bundle.id;
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const integrity = /checksum|decrypt|session key|signature|encrypt/i.test(msg);
    reportEvent('web', integrity ? 'verify_failed' : 'download_failed', { releaseId: web.bundleId, error: msg });
    throw new Error(integrity ? 'The update failed its security check and was discarded.' : `Download failed: ${msg}`);
  } finally {
    await listener.remove();
  }
}

/**
 * Activates a downloaded bundle. 'now' reloads immediately (the JS context is
 * destroyed — nothing after set() runs); 'next' applies on the next restart.
 * Success is only confirmed after the new bundle starts (see initAppUpdates).
 */
export async function activateLiveBundle(offer: UpdateOffer, bundleId: string, mode: 'now' | 'next'): Promise<void> {
  const installed = await getInstalledVersion();
  const pending: PendingUpdate = {
    kind: 'web',
    releaseId: offer.release.releaseId,
    bundleId: offer.manifest.web!.bundleId,
    previousBundleId: installed?.bundleId,
    mode,
    at: Date.now()
  };
  writeJson(LS.pending, pending);
  if (mode === 'next') {
    await CapacitorUpdater.next({ id: bundleId });
  } else {
    await CapacitorUpdater.set({ id: bundleId });
  }
}

/** Keep the current bundle plus the previous known-good one; delete the rest. */
async function pruneBundles(): Promise<void> {
  try {
    const [{ bundles }, current, next] = await Promise.all([CapacitorUpdater.list(), CapacitorUpdater.current(), CapacitorUpdater.getNextBundle()]);
    const keep = new Set([current.bundle.id, next?.id, readJson<string>(LS.previousBundle)].filter(Boolean) as string[]);
    for (const b of bundles) {
      if (b.id !== 'builtin' && !keep.has(b.id)) await CapacitorUpdater.delete({ id: b.id }).catch(() => {});
    }
  } catch {
    /* pruning is best-effort */
  }
}

// ─── native APKs ─────────────────────────────────────────────────────────────

export async function downloadApk(
  offer: UpdateOffer,
  onProgress: (p: number | null) => void,
  onVerifying: () => void
): Promise<string> {
  const native = offer.manifest.native!;
  if (!offer.release.downloadUrl) throw new Error('Download link missing; check for updates again.');
  reportEvent('native', 'download_started', { releaseId: offer.release.releaseId });
  const progress = await ApkUpdater.addListener('downloadProgress', e => onProgress(e.percent >= 0 ? e.percent : null));
  const stage = await ApkUpdater.addListener('stage', () => onVerifying());
  try {
    const res = await ApkUpdater.download({
      url: offer.release.downloadUrl,
      sha256: native.sha256,
      versionCode: native.versionCode,
      signingCertSha256: native.signingCertSha256
    });
    reportEvent('native', 'ready', { releaseId: offer.release.releaseId });
    return res.path;
  } catch (err: any) {
    const code = String(err?.code ?? '');
    const verify = ['CHECKSUM_MISMATCH', 'PACKAGE_MISMATCH', 'VERSION_MISMATCH', 'DOWNGRADE', 'SIGNATURE_MISMATCH', 'INVALID_APK'].includes(code);
    reportEvent('native', verify ? 'verify_failed' : 'download_failed', { releaseId: offer.release.releaseId, error: `${code} ${err?.message ?? ''}` });
    throw new Error(err?.message || 'APK download failed.');
  } finally {
    await progress.remove();
    await stage.remove();
  }
}

export async function canInstallApks(): Promise<boolean> {
  return (await ApkUpdater.canRequestPackageInstalls()).value;
}

export const openInstallPermissionSettings = () => ApkUpdater.openInstallPermissionSettings();

/** Opens Android's installer. Resolves once the installer UI is launched. */
export async function launchApkInstall(offer: UpdateOffer, path: string): Promise<void> {
  const pending: PendingUpdate = {
    kind: 'native',
    releaseId: offer.release.releaseId,
    versionCode: offer.manifest.native!.versionCode,
    at: Date.now()
  };
  writeJson(LS.pending, pending);
  await ApkUpdater.install({ path });
  reportEvent('native', 'apk_install_launched', { releaseId: offer.release.releaseId });
}

/**
 * Called when the app returns to the foreground after the installer was
 * shown. If the app had been updated, Android would have restarted it, so
 * still running the old versionCode means the user cancelled or it failed.
 */
export async function confirmApkInstallOutcome(): Promise<'installed' | 'cancelled' | 'none'> {
  const pending = readJson<PendingUpdate>(LS.pending);
  if (!pending || pending.kind !== 'native') return 'none';
  const info = await CapApp.getInfo();
  if (Number(info.build) >= (pending.versionCode ?? Infinity)) return 'installed';
  reportEvent('native', 'apk_cancelled', { releaseId: pending.releaseId, versionCode: Number(info.build) });
  writeJson(LS.pending, null);
  return 'cancelled';
}

// ─── startup: readiness, activation & rollback confirmation ──────────────────

export interface LastResult {
  outcome: 'completed' | 'recovered';
  message: string;
  at: number;
}

export const takeLastResult = (): LastResult | null => {
  const r = readJson<LastResult>(LS.lastResult);
  writeJson(LS.lastResult, null);
  return r;
};

let initialized = false;

/**
 * Must run as early as possible on every launch. Confirms the running bundle
 * is healthy (otherwise the plugin rolls back after appReadyTimeout) and then
 * reconciles any update that was pending before the restart.
 */
export async function initAppUpdates(): Promise<void> {
  if (!isNativeApp || initialized) return;
  initialized = true;
  try {
    await CapacitorUpdater.notifyAppReady();
  } catch {
    /* plugin missing in this build: nothing to confirm */
  }

  try {
    CapacitorUpdater.addListener('updateFailed', e => {
      reportEvent('web', 'rollback', { bundleId: e.bundle?.version, error: 'bundle failed to start; rolled back' });
      writeJson(LS.lastResult, {
        outcome: 'recovered',
        message: 'The last update could not start, so the app automatically returned to the previous working version.',
        at: Date.now()
      } satisfies LastResult);
    });

    const pending = readJson<PendingUpdate>(LS.pending);
    if (pending?.kind === 'web') {
      const current = await CapacitorUpdater.current();
      const running = current.bundle.id === 'builtin' ? 'builtin' : current.bundle.version;
      if (running === pending.bundleId) {
        writeJson(LS.previousBundle, null);
        if (pending.previousBundleId && pending.previousBundleId !== 'builtin') {
          const prev = (await CapacitorUpdater.list()).bundles.find(b => b.version === pending.previousBundleId);
          if (prev) writeJson(LS.previousBundle, prev.id);
        }
        writeJson(LS.pending, null);
        reportEvent('web', 'activated', { releaseId: pending.releaseId, bundleId: running });
        writeJson(LS.lastResult, { outcome: 'completed', message: `Update ${pending.bundleId} is now active.`, at: Date.now() } satisfies LastResult);
        await pruneBundles();
      } else {
        const bundle = (await CapacitorUpdater.list()).bundles.find(b => b.version === pending.bundleId);
        const stillQueued = pending.mode === 'next' && bundle && bundle.status === 'pending';
        if (!stillQueued) {
          writeJson(LS.pending, null);
          reportEvent('web', 'rollback', { releaseId: pending.releaseId, bundleId: running, error: `bundle status ${bundle?.status ?? 'missing'}` });
          writeJson(LS.lastResult, {
            outcome: 'recovered',
            message: 'The update could not be started, so the app kept running the previous working version.',
            at: Date.now()
          } satisfies LastResult);
        }
      }
    } else if (pending?.kind === 'native') {
      const info = await CapApp.getInfo();
      if (Number(info.build) >= (pending.versionCode ?? Infinity)) {
        writeJson(LS.pending, null);
        reportEvent('native', 'apk_installed', { releaseId: pending.releaseId, versionCode: Number(info.build) });
        writeJson(LS.lastResult, { outcome: 'completed', message: `App updated to version ${info.version}.`, at: Date.now() } satisfies LastResult);
        await ApkUpdater.cleanup().catch(() => {});
      }
    }
  } catch {
    /* reconciliation is best-effort; never block startup */
  }
}
