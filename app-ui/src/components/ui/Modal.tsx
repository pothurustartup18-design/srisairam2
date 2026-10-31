import { useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useOverlay } from '../../hooks/useOverlay';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  footer?: ReactNode;
  children: ReactNode;
  maxWidth?: string; // default '640px'
  className?: string;
}

/**
 * Dialog. A bottom sheet on phones, a centred card from `sm` up.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  footer,
  children,
  maxWidth = '640px',
  className,
}: ModalProps) {
  const panelRef = useOverlay(isOpen, onClose);
  const titleId = useId();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 animate-[overlayFade_.18s_ease-out]" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{ '--modal-max-w': maxWidth } as React.CSSProperties}
        className={cn(
          'relative bg-surface text-ink shadow-overlay flex flex-col overflow-hidden w-full outline-none',
          'max-h-[calc(100dvh-24px)] sm:max-h-[calc(100dvh-48px)]',
          'rounded-t-[22px] sm:rounded-xl sm:border sm:border-line',
          'sm:max-w-[var(--modal-max-w)]',
          'animate-[slideUpSheet_.24s_var(--ease-out)] sm:animate-[fadeScaleIn_.18s_var(--ease-out)]',
          className
        )}
      >
        {/* Phone drag-handle affordance */}
        <div className="flex sm:hidden justify-center pt-2 flex-shrink-0" aria-hidden="true">
          <div className="w-9 h-1 rounded-full bg-line-strong" />
        </div>

        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-3 sm:pt-5 pb-4 border-b border-line flex-shrink-0">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold text-ink m-0 leading-snug">{title}</h2>
            {subtitle && <p className="text-sm text-muted mt-1 m-0">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 sm:w-9 sm:h-9 -mr-2 sm:-mr-1 -mt-1 flex items-center justify-center rounded-md text-muted hover:text-ink hover:bg-surface-3 transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 sm:px-6 py-4 sm:py-5 min-h-0">
          {children}
        </div>

        {footer && (
          <div
            className="px-5 sm:px-6 pt-3 sm:pt-4 border-t border-line bg-surface-2 flex-shrink-0"
            style={{ paddingBottom: 'max(0.875rem, var(--sab))' }}
          >
            {footer}
          </div>
        )}
      </div>

      <style>{`
        @keyframes overlayFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeScaleIn { from { transform: scale(.97); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes slideUpSheet { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </div>
  );
}
