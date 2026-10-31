import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import {
  activateLiveBundle,
  canInstallApks,
  checkForUpdates,
  confirmApkInstallOutcome,
  downloadApk,
  downloadLiveBundle,
  getDismissal,
  getInstalledVersion,
  getLastCheckedAt,
  isNativeApp,
  launchApkInstall,
  openInstallPermissionSettings,
  reportEvent,
  setDismissal,
  takeLastResult
} from '../services/appUpdates/appUpdates';
import { setUpdateAvailable } from '../services/appUpdates/updateBadge';
import { DISMISS_DURATION_MS, initialUpdateState, isBusy, shouldPrompt, updateReducer } from '../services/appUpdates/updateState';

/**
 * State + actions for Settings → App Updates. Checks once when mounted (i.e.
 * when the Settings/Profile screen opens) and exposes manual actions.
 */
export function useAppUpdates() {
  const [state, dispatch] = useReducer(updateReducer, {
    ...initialUpdateState,
    lastCheckedAt: isNativeApp ? getLastCheckedAt() : null
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  // Keep the avatar dot in sync with what Settings shows.
  useEffect(() => {
    if (!isNativeApp) return;
    const pending = ['available', 'downloading', 'verifying', 'ready', 'activating', 'needs-permission', 'awaiting-install', 'cancelled', 'scheduled'];
    if (state.offer && pending.includes(state.status)) setUpdateAvailable(true);
    else if (['up-to-date', 'completed'].includes(state.status)) setUpdateAvailable(false);
  }, [state.offer, state.status]);

  const check = useCallback(async () => {
    if (!isNativeApp || isBusy(stateRef.current.status)) return;
    dispatch({ type: 'CHECK_START' });
    try {
      const installed = await getInstalledVersion();
      if (!installed) return;
      dispatch({ type: 'INSTALLED', installed });
      const { offer, checkedAt } = await checkForUpdates(installed);
      dispatch({ type: 'CHECK_DONE', offer, checkedAt });
    } catch (err: any) {
      dispatch({
        type: 'CHECK_FAILED',
        error: err?.name === 'AbortError' ? 'Update server did not respond. Check your connection and retry.' : err?.message || 'Could not check for updates.'
      });
    }
  }, []);

  useEffect(() => {
    if (!isNativeApp) return;
    const last = takeLastResult();
    if (last) {
      dispatch({ type: last.outcome === 'completed' ? 'COMPLETED' : 'RECOVERED', message: last.message });
      getInstalledVersion().then(i => i && dispatch({ type: 'INSTALLED', installed: i })).catch(() => {});
    } else {
      void check();
    }
  }, [check]);

  // After the Android installer closes and the app resumes without having been
  // restarted, the install was cancelled or failed.
  useEffect(() => {
    if (!isNativeApp) return;
    const sub = CapApp.addListener('resume', async () => {
      if (stateRef.current.status === 'awaiting-install') {
        const outcome = await confirmApkInstallOutcome().catch(() => 'none' as const);
        if (outcome === 'cancelled') dispatch({ type: 'INSTALL_CANCELLED' });
      } else if (stateRef.current.status === 'needs-permission' && (await canInstallApks().catch(() => false))) {
        dispatch({ type: 'READY', ref: stateRef.current.readyRef ?? '' });
      }
    });
    return () => {
      void sub.then(s => s.remove());
    };
  }, []);

  const download = useCallback(async () => {
    const offer = stateRef.current.offer;
    if (!offer) return;
    dispatch({ type: 'DOWNLOAD_START' });
    try {
      const onProgress = (percent: number | null) => dispatch({ type: 'PROGRESS', percent });
      const ref =
        offer.kind === 'web'
          ? await downloadLiveBundle(offer, onProgress)
          : await downloadApk(offer, onProgress, () => dispatch({ type: 'VERIFYING' }));
      dispatch({ type: 'READY', ref });
    } catch (err: any) {
      dispatch({ type: 'FAILED', error: err?.message || 'Update download failed.' });
    }
  }, []);

  /** Web: activate now (reloads) or on next restart. Native: open the installer. */
  const apply = useCallback(async (mode: 'now' | 'next' = 'now') => {
    const { offer, readyRef } = stateRef.current;
    if (!offer || !readyRef) return;
    try {
      if (offer.kind === 'web') {
        dispatch({ type: 'ACTIVATING' });
        await activateLiveBundle(offer, readyRef, mode);
        // 'now' reloads the app (this code never continues); 'next' returns.
        if (mode === 'next') dispatch({ type: 'SCHEDULED' });
      } else {
        if (!(await canInstallApks())) {
          dispatch({ type: 'NEEDS_PERMISSION' });
          return;
        }
        dispatch({ type: 'AWAITING_INSTALL' });
        await launchApkInstall(offer, readyRef);
      }
    } catch (err: any) {
      reportEvent(offer.kind, 'failed', { releaseId: offer.release.releaseId, error: String(err?.message ?? err) });
      dispatch({ type: 'FAILED', error: err?.message || 'Could not apply the update.' });
    }
  }, []);

  const [dismissal, setDismissalState] = useState(getDismissal);
  const dismiss = useCallback(() => {
    const offer = stateRef.current.offer;
    if (offer && !offer.mandatory) {
      const d = { releaseId: offer.release.releaseId, until: Date.now() + DISMISS_DURATION_MS };
      setDismissal(d);
      setDismissalState(d);
    }
  }, []);

  const isDismissed = !!(state.offer && !shouldPrompt({ releaseId: state.offer.release.releaseId, mandatory: state.offer.mandatory }, dismissal, Date.now()));

  return {
    state,
    isNativeApp,
    isDismissed,
    check,
    download,
    apply,
    dismiss,
    reset: () => dispatch({ type: 'RESET' }),
    openInstallPermissionSettings
  };
}
