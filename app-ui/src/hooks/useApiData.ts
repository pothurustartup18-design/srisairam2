import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, isAbortError } from '../lib/http';

export type DataStatus = 'idle' | 'loading' | 'success' | 'error';

interface Options<T> {
  /** Skip loading until true (e.g. missing id or permission). */
  enabled?: boolean;
  initialData?: T;
  /** Message shown when the request fails without a better explanation. */
  errorFallback?: string;
}

/**
 * Loads data for a screen with a well-defined lifecycle:
 *  - `status` is 'loading' only until the first result; later reloads keep the
 *    previous data on screen and set `refreshing` instead.
 *  - When deps change or the screen unmounts, the in-flight request is aborted
 *    and its response ignored, so a slow old answer never replaces a newer one.
 *  - Failures stop the loader, keep any previous data and expose a safe `error`.
 */
export function useApiData<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  { enabled = true, initialData, errorFallback }: Options<T> = {},
) {
  const [data, setData] = useState<T | undefined>(initialData);
  const [status, setStatus] = useState<DataStatus>(enabled ? 'loading' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadRef = useRef(load);
  loadRef.current = load;
  const runId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const hasData = useRef(initialData !== undefined);

  const run = useCallback(async () => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    const id = ++runId.current;

    if (hasData.current) setRefreshing(true);
    else setStatus('loading');
    setError(null);

    try {
      const result = await loadRef.current(ctrl.signal);
      if (id !== runId.current) return;
      hasData.current = true;
      setData(result);
      setStatus('success');
    } catch (err) {
      if (id !== runId.current || isAbortError(err)) return;
      setError(errorMessage(err, errorFallback));
      setStatus(hasData.current ? 'success' : 'error');
    } finally {
      if (id === runId.current) setRefreshing(false);
    }
  }, [errorFallback]);

  useEffect(() => {
    if (!enabled) {
      setStatus(hasData.current ? 'success' : 'idle');
      return;
    }
    run();
    return () => {
      runId.current++;
      controller.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  return {
    data,
    setData,
    status,
    error,
    refreshing,
    /** True only while waiting for the first result. */
    loading: status === 'loading',
    reload: run,
  };
}
