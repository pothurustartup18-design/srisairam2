import { KeyRound, Trash2, X } from 'lucide-react';
import type { SavedLogin } from '../../../services/savedLogins';

const ROLE_LABEL: Record<SavedLogin['role'], string> = {
  admin: 'Admin',
  teacher: 'Teacher',
  parent: 'Parent'
};

interface SavedLoginsSheetProps {
  logins: SavedLogin[];
  busy: boolean;
  onPick: (login: SavedLogin) => void;
  onRemove: (login: SavedLogin) => void;
  onClose: () => void;
}

/** Bottom sheet listing the accounts remembered on this phone. Passwords are never shown. */
export default function SavedLoginsSheet({ logins, busy, onPick, onRemove, onClose }: SavedLoginsSheetProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 backdrop-blur-[2px]"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="saved-logins-title"
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-modal"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <KeyRound size={18} className="text-blue" />
            <h2 id="saved-logins-title" className="m-0 text-base font-bold text-slate-900">Saved logins</h2>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <ul className="m-0 flex max-h-[50vh] list-none flex-col gap-2 overflow-y-auto p-0">
          {logins.map(login => (
            <li key={login.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 pr-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => onPick(login)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-3 text-left disabled:opacity-60"
              >
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue text-sm font-bold text-white">
                  {(login.name || login.username).trim().charAt(0).toUpperCase() || '?'}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">{login.name || login.username}</span>
                  <span className="block truncate text-xs text-slate-500">{ROLE_LABEL[login.role]} · {login.username}</span>
                </span>
              </button>
              <button
                type="button"
                aria-label={`Remove saved login for ${login.username}`}
                disabled={busy}
                onClick={() => onRemove(login)}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 h-11 w-full rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Use a different account
        </button>
      </div>
    </div>
  );
}
