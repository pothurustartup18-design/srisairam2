import type { CapacitorConfig } from '@capacitor/cli';
import { readFileSync } from 'node:fs';

// Public half of the release-signing key. The updater plugin refuses any live
// bundle whose checksum/session key was not signed by the matching private key
// (held only by the CI release pipeline). See docs/APP_UPDATES.md.
// (Relative to the project root, where all `npx cap` commands run.)
const releasePublicKey = readFileSync('release/keys/release-signing-public.pem', 'utf8').trim();

const localHttp = process.env.CAPACITOR_LOCAL_HTTP === '1';

const config: CapacitorConfig = {
  // Must match android/app/build.gradle applicationId; changing it would make
  // Android treat the app as a different app and strand existing installs.
  appId: 'com.schoolhub.app',
  appName: 'EduTrack',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // Plain-HTTP API access is for local Wi-Fi testing only (local-release.mjs sets
    // CAPACITOR_LOCAL_HTTP=1). Production builds are HTTPS-only.
    cleartext: localHttp
  },
  android: {
    allowMixedContent: localHttp
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#ffffff',
      showSpinner: true,
      spinnerColor: '#6366f1'
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#ffffff'
    },
    CapacitorUpdater: {
      // Manual, self-hosted mode: the app decides when to check/download/apply
      // (Settings → App Updates). Nothing is sent to Capgo's cloud.
      autoUpdate: false,
      updateUrl: '',
      statsUrl: '',
      channelUrl: '',
      publicKey: releasePublicKey,
      // Roll back to the last good bundle if a new one doesn't call
      // notifyAppReady() within this time after loading.
      appReadyTimeout: 15000,
      autoDeleteFailed: true,
      // Keep the previous bundle on disk; the app prunes to current + one
      // previous itself so a known-good bundle is always available locally.
      autoDeletePrevious: false,
      // A newer APK ships a newer built-in bundle: drop downloaded bundles.
      resetWhenUpdate: true
    }
  }
};

export default config;
