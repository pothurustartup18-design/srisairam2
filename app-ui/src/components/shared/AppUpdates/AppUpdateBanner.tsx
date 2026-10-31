import { useEffect, useState } from 'react';
import { ArrowUpCircle, X } from 'lucide-react';
import { Modal } from '../../ui';
import AppUpdates from './AppUpdates';
import { setUpdateAvailable } from '../../../services/appUpdates/updateBadge';
import { getDismissal, isNativeApp, setDismissal, startupCheck } from '../../../services/appUpdates/appUpdates';
import { DISMISS_DURATION_MS, shouldPrompt, type UpdateOffer } from '../../../services/appUpdates/updateState';

/**
 * Non-blocking prompt shown after a throttled background check finds an update.
 * Optional updates can be postponed for a few days; mandatory ones stay visible
 * but never block the ERP (attendance, fees, etc. keep working).
 */
export default function AppUpdateBanner() {
  const [offer, setOffer] = useState<UpdateOffer | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isNativeApp) return;
    // Let the app finish its own startup requests first.
    const t = setTimeout(() => {
      startupCheck()
        .then(o => {
          if (o) setUpdateAvailable(true); // avatar dot stays even if the banner was postponed
          if (o && shouldPrompt({ releaseId: o.release.releaseId, mandatory: o.mandatory }, getDismissal(), Date.now())) setOffer(o);
        })
        .catch(() => {});
    }, 8000);
    return () => clearTimeout(t);
  }, []);

  if (!offer) return null;

  const later = () => {
    setDismissal({ releaseId: offer.release.releaseId, until: Date.now() + DISMISS_DURATION_MS });
    setOffer(null);
  };

  return (
    <>
      {/* Hidden while the details panel is open so it can't cover the Update now button. */}
      {!open && (
      <div
        role="status"
        className="fixed inset-x-3 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-lg"
        style={{ bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))' }}
      >
        <ArrowUpCircle size={20} className={offer.mandatory ? 'text-red-600 flex-shrink-0' : 'text-blue flex-shrink-0'} />
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-bold text-slate-800">{offer.mandatory ? 'Update required' : 'Update available'}</div>
          <div className="truncate text-xs text-slate-500">{offer.versionLabel}</div>
        </div>
        <button className="h-11 rounded-md bg-blue px-4 text-sm font-semibold text-white" onClick={() => setOpen(true)}>
          View
        </button>
        {!offer.mandatory && (
          <button aria-label="Remind me later" className="h-11 w-11 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100" onClick={later}>
            <X size={18} />
          </button>
        )}
      </div>
      )}
      <Modal isOpen={open} onClose={() => setOpen(false)} title="App Updates" maxWidth="520px">
        <AppUpdates className="border-0" />
      </Modal>
    </>
  );
}
