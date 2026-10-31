import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/** Base look for text inputs: 44px tall, token border, visible focus ring. */
export const inputClass =
  'w-full h-control px-3 rounded-md border border-line-strong bg-surface text-base text-ink placeholder:text-faint outline-none transition-[border-color,box-shadow] duration-150 focus:border-blue-500 focus:shadow-focus disabled:bg-surface-2 disabled:text-muted disabled:cursor-not-allowed';

export const selectClass = cn(inputClass, 'pr-9 cursor-pointer');

export const textareaClass = cn(inputClass, 'h-auto min-h-[96px] py-2.5 leading-relaxed');

interface FieldProps {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

/** Label + control + hint/error, stacked. */
export function Field({ label, htmlFor, hint, error, required, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5 min-w-0', className)}>
      <label htmlFor={htmlFor} className="text-sm font-semibold text-ink-2">
        {label}
        {required && <span className="text-danger ml-0.5" aria-hidden="true">*</span>}
      </label>
      {children}
      {error ? (
        <p className="m-0 text-xs font-medium text-danger" role="alert">{error}</p>
      ) : hint ? (
        <p className="m-0 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
