import { useEffect } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

type BackHandler = () => boolean;

// Stack of active back button handlers (modals, drawers, sub-views)
const backHandlers: BackHandler[] = [];

export const registerBackHandler = (handler: BackHandler) => {
  backHandlers.push(handler);
  return () => {
    const idx = backHandlers.indexOf(handler);
    if (idx !== -1) {
      backHandlers.splice(idx, 1);
    }
  };
};

let lastBackPressTime = 0;

/** Offers a back press to registered handlers (top of the stack first); true if one consumed it. */
const runBackHandlers = (): boolean => {
  for (let i = backHandlers.length - 1; i >= 0; i--) {
    if (backHandlers[i]()) return true;
  }
  return false;
};

/**
 * useMobileApp
 * Initializes Capacitor native features, dark/light status bar, and smart back-button stack navigation.
 */
export function useMobileApp() {
  // Dev only: lets device-preview.html simulate the Android back button in a browser
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __deviceBack?: () => boolean };
    w.__deviceBack = runBackHandlers;
    return () => { delete w.__deviceBack; };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Status bar. On Android 15+ the app is drawn edge-to-edge behind the bar (env(safe-area-inset-top) > 0)
    // and setBackgroundColor is ignored, so the clock/signal icons sit on our light page: make them dark.
    // On older Android the bar keeps its own dark background, so keep light icons there.
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;padding-top:env(safe-area-inset-top,0px)';
    document.body.appendChild(probe);
    const drawsBehindStatusBar = probe.offsetHeight > 0;
    probe.remove();
    if (drawsBehindStatusBar) {
      StatusBar.setStyle({ style: Style.Light }).catch(() => {});
    } else {
      StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      StatusBar.setBackgroundColor({ color: '#111827' }).catch(() => {});
    }

    // Android Hardware Back Button Handler
    const backListenerPromise = CapApp.addListener('backButton', () => {
      // 1. Check registered handlers (modals, drawers, nested tabs) from top to bottom
      if (runBackHandlers()) return;

      // 2. Double-press to exit protection when on main root dashboard
      const now = Date.now();
      if (now - lastBackPressTime < 2000) {
        CapApp.exitApp();
      } else {
        lastBackPressTime = now;
        // Optionally inform user
        const toastEl = document.createElement('div');
        toastEl.innerText = 'Press back again to exit app';
        toastEl.style.position = 'fixed';
        toastEl.style.bottom = '80px';
        toastEl.style.left = '50%';
        toastEl.style.transform = 'translateX(-50%)';
        toastEl.style.backgroundColor = 'rgba(0,0,0,0.85)';
        toastEl.style.color = '#ffffff';
        toastEl.style.padding = '8px 16px';
        toastEl.style.borderRadius = '20px';
        toastEl.style.fontSize = '12px';
        toastEl.style.zIndex = '99999';
        toastEl.style.pointerEvents = 'none';
        toastEl.style.transition = 'opacity 0.3s ease';
        document.body.appendChild(toastEl);
        setTimeout(() => {
          toastEl.style.opacity = '0';
          setTimeout(() => toastEl.remove(), 300);
        }, 1500);
      }
    });

    return () => {
      backListenerPromise.then((handle) => handle.remove()).catch(() => {});
    };
  }, []);
}
