import React from 'react';
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw, ShieldCheck, Smartphone, Undo2 } from 'lucide-react';
import { Badge, Button } from '../../ui';
import { cn } from '../../../lib/utils';
import { useAppUpdates } from '../../../hooks/useAppUpdates';
import { formatBytes, type UpdateStatus } from '../../../services/appUpdates/updateState';

/**
 * Settings → App Updates. Rendered in each portal's profile/account screen;
 * only does anything inside the installed Android app (the web version is
 * always served fresh by the server).
 */

const STATUS_TEXT: Record<UpdateStatus, string> = {
  idle: 'Not checked yet',
  checking: 'Checking for updates…',
  'up-to-date': 'You have the latest version',
  available: 'Update available',
  downloading: 'Downloading update…',
  verifying: 'Verifying update…',
  ready: 'Update ready',
  activating: 'Applying update…',
  'needs-permission': 'Permission needed to install',
  'awaiting-install': 'Waiting for Android installation…',
  completed: 'Update completed',
  cancelled: 'Update cancelled',
  failed: 'Update failed',
  recovered: 'Recovered previous version'
};

const formatTime = (iso: string | null) => {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Never' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800 text-right break-all">{children}</span>
    </div>
  );
}

export default function AppUpdates({ className }: { className?: string }) {
  const { state, isNativeApp, isDismissed, check, download, apply, dismiss, reset, openInstallPermissionSettings } = useAppUpdates();
  const { status, installed, offer, progress, error, message, lastCheckedAt, scheduled } = state;

  if (!isNativeApp) return null;

  const busy = ['checking', 'downloading', 'verifying', 'activating', 'awaiting-install'].includes(status);
  const statusVariant =
    status === 'failed' ? 'red'
      : status === 'up-to-date' || status === 'completed' ? 'green'
        : status === 'recovered' || status === 'needs-permission' || status === 'cancelled' ? 'amber'
          : offer?.mandatory ? 'red'
            : 'blue';

  return (
    <div className={cn('bg-white border border-slate-200 rounded-lg overflow-hidden shrink-0', className)}>
      <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-3">
          <Smartphone size={15} className="text-slate-500 flex-shrink-0" />
          <div>
            <div className="text-sm font-bold text-slate-800">App Updates</div>
            <div className="text-xs text-slate-400 mt-0.5">Updates are signed and verified before they are installed.</div>
          </div>
        </div>
        <Badge variant={statusVariant} size="sm">
          {busy && <Loader2 size={11} className="animate-spin" />}
          {STATUS_TEXT[status]}
        </Badge>
      </div>

      <div className="px-5 py-3 divide-y divide-slate-100">
        <Row label="Installed version">
          {installed ? `v${installed.versionName} (build ${installed.versionCode})` : '—'}
        </Row>
        {installed && installed.bundleId !== 'builtin' && <Row label="Web bundle">{installed.bundleId}</Row>}
        <Row label="Latest compatible version">
          {offer ? offer.versionLabel : status === 'up-to-date' || status === 'completed' ? 'Installed' : '—'}
        </Row>
        <Row label="Last checked">{formatTime(lastCheckedAt)}</Row>
      </div>

      {offer && !['completed', 'recovered'].includes(status) && (
        <div className="mx-5 mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-slate-800">{offer.versionLabel}</span>
            <Badge variant={offer.kind === 'native' ? 'purple' : 'blue'} size="sm">
              {offer.kind === 'native' ? 'App install' : 'Quick update'}
            </Badge>
            <Badge variant={offer.mandatory ? 'red' : 'gray'} size="sm">{offer.mandatory ? 'Required' : 'Optional'}</Badge>
            <span className="text-xs text-slate-500">{formatBytes(offer.sizeBytes)}</span>
          </div>
          {offer.notes.length > 0 && (
            <ul className="mt-3 list-disc pl-5 space-y-1 text-sm text-slate-600">
              {offer.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
          {offer.mandatory && (
            <p className="mt-3 text-xs font-semibold text-red-700">
              This version of the app is no longer supported. Please update to keep using all features.
            </p>
          )}
          {offer.kind === 'native' && status === 'available' && (
            <p className="mt-3 text-xs text-slate-500">
              Android will ask you to confirm the installation. Your data and login are kept.
            </p>
          )}
          {isDismissed && status === 'available' && (
            <p className="mt-2 text-xs text-slate-400">You postponed this update. It won't be shown again for a few days.</p>
          )}

          {(status === 'downloading' || status === 'verifying') && (
            <div className="mt-4">
              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={cn('h-full bg-blue transition-all', (progress === null || status === 'verifying') && 'animate-pulse w-full')}
                  style={progress !== null && status === 'downloading' ? { width: `${Math.max(2, progress)}%` } : undefined}
                />
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                {status === 'verifying' ? <ShieldCheck size={12} /> : <Download size={12} />}
                {status === 'verifying' ? 'Checking signature and integrity…' : progress !== null ? `${progress}%` : 'Downloading…'}
              </div>
            </div>
          )}
        </div>
      )}

      {(message || error) && (
        <div
          className={cn(
            'mx-5 mb-4 flex items-start gap-2 rounded-lg p-3 text-sm',
            error ? 'bg-red-50 text-red-700' : status === 'recovered' || status === 'cancelled' ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'
          )}
        >
          {error ? <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            : status === 'recovered' ? <Undo2 size={16} className="mt-0.5 flex-shrink-0" />
              : <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />}
          <span>{error ?? message}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2 px-5 pb-5">
        {status === 'available' && (
          <>
            <Button onClick={download}>
              <Download size={15} /> Update now
            </Button>
            {!offer?.mandatory && !isDismissed && (
              <Button variant="ghost" onClick={dismiss}>Later</Button>
            )}
          </>
        )}

        {status === 'ready' && offer?.kind === 'web' && !scheduled && (
          <>
            <Button onClick={() => apply('now')}>
              <RefreshCw size={15} /> Restart &amp; apply
            </Button>
            <Button variant="secondary" onClick={() => apply('next')}>Apply on next launch</Button>
          </>
        )}

        {(status === 'ready' || status === 'cancelled') && offer?.kind === 'native' && (
          <Button onClick={() => apply()}>
            <Download size={15} /> {status === 'cancelled' ? 'Install again' : 'Install update'}
          </Button>
        )}

        {status === 'needs-permission' && (
          <>
            <p className="w-full text-sm text-slate-600">
              Allow this app to install updates: tap the button, turn on <strong>Allow from this source</strong>, then come back.
            </p>
            <Button onClick={() => void openInstallPermissionSettings()}>Open settings</Button>
            <Button variant="secondary" onClick={() => apply()}>I've allowed it</Button>
          </>
        )}

        {status === 'failed' && (
          <Button variant="secondary" onClick={() => { reset(); void check(); }}>
            <RefreshCw size={15} /> Retry
          </Button>
        )}

        {['idle', 'up-to-date', 'completed', 'recovered', 'available'].includes(status) && (
          <Button variant="secondary" onClick={() => void check()}>
            <RefreshCw size={15} /> Check for updates
          </Button>
        )}

        {status === 'checking' && (
          <Button variant="secondary" loading>Checking…</Button>
        )}
      </div>
    </div>
  );
}
