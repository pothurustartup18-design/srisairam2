import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';
import { useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type MouseEvent } from 'react';
import { FormPendingContext } from './Form';

const buttonVariants = cva(
  // Base styles shared by every variant
  'inline-flex items-center justify-center gap-2 font-semibold rounded-md border transition-[background-color,border-color,color,box-shadow,transform] duration-150 select-none disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none active:scale-[0.98] whitespace-nowrap',
  {
    variants: {
      variant: {
        primary:   'bg-blue text-white border-transparent shadow-xs hover:bg-blue-dk',
        secondary: 'bg-surface text-ink border-line-strong shadow-xs hover:bg-surface-2',
        danger:    'bg-danger text-white border-transparent shadow-xs hover:brightness-95',
        success:   'bg-success text-white border-transparent shadow-xs hover:brightness-95',
        ghost:     'bg-transparent text-ink-2 border-transparent hover:bg-surface-3',
        outline:   'bg-surface text-blue-700 border-blue-300 hover:bg-blue-50 dark:text-blue-300 dark:border-blue-700',
      },
      size: {
        // md/lg/icon are the sizes used for primary, standalone, and mobile
        // card-row actions — kept at/above the 44px touch-target minimum.
        // sm/icon-sm stay compact for dense, pointer-driven desktop table rows
        // (those actions live inside `hidden md:block` tables, not mobile views).
        sm: 'h-control-sm px-3 text-sm',
        md: 'h-control px-4 text-sm',
        lg: 'h-12 px-5 text-md',
        icon: 'h-11 w-11 p-0',
        'icon-sm': 'h-8 w-8 p-0 rounded-sm',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

/**
 * Tracks the promise an onClick handler returns: `busy` stays true until it
 * settles (success or failure), and clicks while busy are ignored. A submit
 * button is also busy while its enclosing <Form> is submitting.
 */
export function usePendingClick(
  onClick: ((e: MouseEvent<HTMLButtonElement>) => unknown) | undefined,
  type: ButtonHTMLAttributes<HTMLButtonElement>['type'],
  forced?: boolean,
) {
  const [clickPending, setClickPending] = useState(false);
  const formPending = useContext(FormPendingContext);

  // A button with no type inside a form is a submit button too.
  const isSubmit = type === undefined || type === 'submit';
  // If forced is explicitly passed (true or false), it takes strict precedence
  const busy = forced !== undefined ? forced : Boolean(clickPending || (isSubmit && formPending));

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (busy) { e.preventDefault(); return; }
    const result = onClick?.(e);
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      setClickPending(true);
      const done = () => { setClickPending(false); };
      (result as Promise<unknown>).then(done, done).catch(done);
    }
  };

  return { busy, handleClick };
}

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  /** Label shown while busy, e.g. "Saving…". Defaults to the normal children. */
  loadingText?: React.ReactNode;
}

/**
 * Busy feedback is automatic: when `onClick` returns a promise the button shows
 * a spinner and ignores further clicks until it settles, and a submit button
 * does the same while its enclosing <Form> is submitting. `loading` forces it.
 */
export function Button({
  className,
  variant,
  size,
  loading,
  loadingText,
  disabled,
  children,
  onClick,
  type,
  ...props
}: ButtonProps) {
  const { busy, handleClick } = usePendingClick(onClick, type, loading);

  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={handleClick}
      {...props}
    >
      {busy && <Loader2 size={16} className="animate-spin shrink-0" aria-hidden="true" />}
      {busy && loadingText ? loadingText : children}
    </button>
  );
}

export { buttonVariants };
