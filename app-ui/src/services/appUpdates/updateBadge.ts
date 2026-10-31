import { useSyncExternalStore } from 'react';

/**
 * Tiny shared flag: "an update is waiting". Set by the background check and the
 * Settings card, read by the avatar dot in every portal's header. In-memory
 * only; the next check (app start or opening the profile page) re-sets it.
 */
let available = false;
const listeners = new Set<() => void>();

export function setUpdateAvailable(value: boolean): void {
  if (available === value) return;
  available = value;
  listeners.forEach(l => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useUpdateAvailable = (): boolean => useSyncExternalStore(subscribe, () => available, () => false);
