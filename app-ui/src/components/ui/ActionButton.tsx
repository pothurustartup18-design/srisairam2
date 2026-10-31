import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';
import { usePendingClick } from './Button';

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Replace the content with the spinner while busy (icon-only buttons). */
  iconOnly?: boolean;
  loading?: boolean;
}

/**
 * Unstyled <button> with the same automatic busy state as <Button>: when
 * onClick returns a promise it disables itself and ignores repeat clicks until
 * the promise settles. Keeps the caller's own styling. If the caller already
 * disables it during the action (and shows its own feedback) no extra spinner
 * is added.
 */
export function ActionButton({ iconOnly, loading, disabled, onClick, type, className, children, ...props }: ActionButtonProps) {
  const { busy, handleClick } = usePendingClick(onClick, type, loading);
  const showSpinner = busy && !disabled;
  return (
    <button
      type={type}
      className={cn(className, showSpinner && 'cursor-progress opacity-70')}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={handleClick}
      {...props}
    >
      {showSpinner && iconOnly ? (
        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
      ) : (
        <>
          {showSpinner && <Loader2 size={13} className="animate-spin inline-block mr-1.5 -mt-0.5" aria-hidden="true" />}
          {children}
        </>
      )}
    </button>
  );
}
