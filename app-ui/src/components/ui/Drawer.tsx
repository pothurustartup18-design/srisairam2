import { useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { StatusBarSpacer } from './StatusBarSpacer';
import { cn } from '../../lib/utils';
import { useOverlay } from '../../hooks/useOverlay';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  footer?: ReactNode;
  children: ReactNode;
  width?: string; // default '560px'
}

/**
 * Side panel for Add/Edit forms: full screen on phones, a right-hand panel of
 * `width` from `sm` up. The footer stays pinned so Save is always reachable.
 */
export function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  footer,
  children,
  width = '560px',
}: DrawerProps) {
  const panelRef = useOverlay(isOpen, onClose);
  const titleId = useId();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/45 animate-[overlayFade_.18s_ease-out]" onClick={onClose} />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{ '--drawer-w': width } as React.CSSProperties}
        className={cn(
          'relative bg-surface text-ink h-full flex flex-col shadow-overlay overflow-hidden w-full outline-none',
          'sm:w-[var(--drawer-w)] sm:max-w-full sm:border-l sm:border-line',
          'animate-[slideInRight_.24s_var(--ease-out)]'
        )}
      >
        <StatusBarSpacer className="bg-surface" />

        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 border-b border-line flex-shrink-0">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold text-ink m-0 leading-snug">{title}</h2>
            {subtitle && <p className="text-sm text-muted mt-1 m-0">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 sm:w-9 sm:h-9 -mr-2 sm:-mr-1 flex items-center justify-center rounded-md text-muted hover:text-ink hover:bg-surface-3 transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 sm:px-6 py-5 min-h-0">
          {children}
        </div>

        {footer && (
          <div
            className="px-5 sm:px-6 pt-3 sm:pt-4 border-t border-line bg-surface flex-shrink-0"
            style={{ paddingBottom: 'max(0.875rem, var(--sab))' }}
          >
            {footer}
          </div>
        )}
      </div>

      <style>{`
        @keyframes overlayFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </div>
  );
}
