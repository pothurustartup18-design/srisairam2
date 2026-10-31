import type { InstalledVersion, ReleaseManifest, SignedRelease } from './manifest';

/**
 * Pure state machine for Settings → App Updates. All side effects live in
 * appUpdates.ts / useAppUpdates.ts; this file only decides what the UI shows,
 * so it can be unit-tested without a device.
 */

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'verifying'
  | 'ready' // web bundle downloaded+verified, or APK verified, awaiting the user
  | 'activating'
  | 'needs-permission' // Android "install unknown apps" permission required
  | 'awaiting-install' // system installer is open
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'recovered'; // a bad bundle was rolled back automatically

export interface UpdateOffer {
  kind: 'native' | 'web';
  release: SignedRelease;
  manifest: ReleaseManifest;
  mandatory: boolean;
  versionLabel: string;
  sizeBytes: number;
  notes: string[];
}

export interface UpdateState {
  status: UpdateStatus;
  installed: InstalledVersion | null;
  offer: UpdateOffer | null;
  progress: number | null; // 0-100, null when unknown
  error: string | null;
  message: string | null;
  lastCheckedAt: string | null;
  /** Downloaded web bundle id, or verified APK path, ready to apply. */
  readyRef: string | null;
  /** Web bundle queued to activate on the next app restart. */
  scheduled: boolean;
}

export type UpdateAction =
  | { type: 'INSTALLED'; installed: InstalledVersion }
  | { type: 'CHECK_START' }
  | { type: 'CHECK_DONE'; offer: UpdateOffer | null; checkedAt: string }
  | { type: 'CHECK_FAILED'; error: string }
  | { type: 'DOWNLOAD_START' }
  | { type: 'PROGRESS'; percent: number | null }
  | { type: 'VERIFYING' }
  | { type: 'READY'; ref: string }
  | { type: 'SCHEDULED' }
  | { type: 'NEEDS_PERMISSION' }
  | { type: 'ACTIVATING' }
  | { type: 'AWAITING_INSTALL' }
  | { type: 'INSTALL_CANCELLED' }
  | { type: 'FAILED'; error: string }
  | { type: 'COMPLETED'; message: string }
  | { type: 'RECOVERED'; message: string }
  | { type: 'RESET' };

export const initialUpdateState: UpdateState = {
  status: 'idle',
  installed: null,
  offer: null,
  progress: null,
  error: null,
  message: null,
  lastCheckedAt: null,
  readyRef: null,
  scheduled: false
};

// Work in progress must not be clobbered by a background re-check.
const BUSY: UpdateStatus[] = ['downloading', 'verifying', 'activating', 'awaiting-install'];
export const isBusy = (s: UpdateStatus) => BUSY.includes(s);

export function updateReducer(state: UpdateState, action: UpdateAction): UpdateState {
  switch (action.type) {
    case 'INSTALLED':
      return { ...state, installed: action.installed };
    case 'CHECK_START':
      if (isBusy(state.status)) return state;
      return { ...state, status: 'checking', error: null };
    case 'CHECK_DONE':
      if (isBusy(state.status)) return { ...state, lastCheckedAt: action.checkedAt };
      return {
        ...state,
        status: action.offer ? 'available' : 'up-to-date',
        offer: action.offer,
        progress: null,
        error: null,
        readyRef: null,
        lastCheckedAt: action.checkedAt
      };
    case 'CHECK_FAILED':
      if (isBusy(state.status)) return state;
      return { ...state, status: 'failed', error: action.error };
    case 'DOWNLOAD_START':
      if (!state.offer) return state;
      return { ...state, status: 'downloading', progress: 0, error: null, message: null };
    case 'PROGRESS':
      if (state.status !== 'downloading') return state;
      return { ...state, progress: action.percent };
    case 'VERIFYING':
      return { ...state, status: 'verifying', progress: null };
    case 'READY':
      return { ...state, status: 'ready', readyRef: action.ref, progress: null, scheduled: false };
    case 'SCHEDULED':
      if (state.status !== 'activating' || !state.readyRef) return state;
      return { ...state, status: 'ready', scheduled: true, message: 'The update will be applied the next time the app restarts.' };
    case 'NEEDS_PERMISSION':
      return { ...state, status: 'needs-permission' };
    case 'ACTIVATING':
      return { ...state, status: 'activating' };
    case 'AWAITING_INSTALL':
      return { ...state, status: 'awaiting-install' };
    case 'INSTALL_CANCELLED':
      // Keep the verified APK so "Install" can be retried without re-downloading.
      return { ...state, status: 'cancelled', message: 'Installation was cancelled. Your current app is unchanged.' };
    case 'FAILED':
      return { ...state, status: 'failed', error: action.error, progress: null };
    case 'COMPLETED':
      return { ...state, status: 'completed', message: action.message, offer: null, readyRef: null, error: null };
    case 'RECOVERED':
      return { ...state, status: 'recovered', message: action.message, readyRef: null };
    case 'RESET':
      return { ...initialUpdateState, installed: state.installed, lastCheckedAt: state.lastCheckedAt };
    default:
      return state;
  }
}

// ─── Dismissal & startup-check policy ─────────────────────────────────────────

export const DISMISS_DURATION_MS = 3 * 24 * 60 * 60 * 1000;
export const STARTUP_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000;

export interface Dismissal {
  releaseId: string;
  until: number;
}

/** Optional updates the user dismissed stay quiet for 3 days; mandatory ones never do. */
export function shouldPrompt(offer: Pick<UpdateOffer, 'mandatory'> & { releaseId: string }, dismissal: Dismissal | null, now: number): boolean {
  if (offer.mandatory) return true;
  return !(dismissal && dismissal.releaseId === offer.releaseId && dismissal.until > now);
}

export interface StartupCheckRecord {
  lastAttemptAt: number;
  consecutiveFailures: number;
}

/** Background checks run every 6h; after failures back off exponentially (max 24h). */
export function isStartupCheckDue(record: StartupCheckRecord | null, now: number): boolean {
  if (!record) return true;
  const wait = record.consecutiveFailures > 0
    ? Math.min(MAX_BACKOFF_MS, 15 * 60 * 1000 * 2 ** (record.consecutiveFailures - 1))
    : STARTUP_CHECK_INTERVAL_MS;
  return now - record.lastAttemptAt >= wait;
}

export const formatBytes = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};
