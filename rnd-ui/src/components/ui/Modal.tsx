import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

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
 * Centred overlay modal dialog.
 * Replaces .as-modal-* patterns across Students and other modules.
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
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-[2px]"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      {/* Mobile: full-width bottom sheet. sm:+ : centered card constrained by `maxWidth`. */}
      <div
        style={{ '--modal-max-w': maxWidth } as React.CSSProperties}
        className={cn(
          'bg-white shadow-modal flex flex-col overflow-hidden w-full',
          'max-h-[92vh] sm:max-h-[90vh]',
          'rounded-t-2xl sm:rounded-lg',
          'sm:max-w-[var(--modal-max-w)]',
          'animate-[slideUpSheet_.22s_ease-out] sm:animate-[fadeScaleIn_.18s_cubic-bezier(0.4,0,0.2,1)]',
          className
        )}
      >
        {/* Mobile-only drag handle affordance */}
        <div className="flex sm:hidden justify-center pt-2.5 pb-1 flex-shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 py-4 sm:py-5 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900 m-0">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="w-11 h-11 sm:w-8 sm:h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors flex-shrink-0 -mr-2 sm:mr-0 -mt-1 sm:mt-0.5"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 sm:py-5 overflow-x-hidden min-h-0">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-5 sm:px-6 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            {footer}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeScaleIn {
          from { transform: scale(.96); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        @keyframes slideUpSheet {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
