import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/** TypeScript binding for android/app/src/main/java/com/schoolhub/app/ApkUpdaterPlugin.java. */
export interface ApkUpdaterPlugin {
  getInstalledInfo(): Promise<{
    packageName: string;
    versionCode: number;
    versionName: string;
    signingCertSha256: string;
    canRequestPackageInstalls: boolean;
  }>;
  download(options: { url: string; sha256: string; versionCode: number; signingCertSha256: string }): Promise<{
    path: string;
    sha256: string;
    versionCode: number;
    versionName: string;
  }>;
  canRequestPackageInstalls(): Promise<{ value: boolean }>;
  openInstallPermissionSettings(): Promise<void>;
  install(options: { path: string }): Promise<void>;
  cleanup(options?: { keepPath?: string }): Promise<void>;
  addListener(
    eventName: 'downloadProgress',
    listener: (e: { percent: number; bytes: number; total: number }) => void
  ): Promise<PluginListenerHandle>;
  addListener(eventName: 'stage', listener: (e: { stage: 'verifying' }) => void): Promise<PluginListenerHandle>;
}

export const ApkUpdater = registerPlugin<ApkUpdaterPlugin>('ApkUpdater');
