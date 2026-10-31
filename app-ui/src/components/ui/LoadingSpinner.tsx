import { cn } from '../../lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** If true, centres the spinner in a full-height container */
  fullPage?: boolean;
}

const sizeClasses = {
  sm: 'w-4 h-4 border-2',
  md: 'w-5 h-5 border-[3px]',
  lg: 'w-8 h-8 border-4',
};

/**
 * CSS-animation spinner. Replaces .at-spinner, .as-spinner, .aa-spinner.
 */
export function LoadingSpinner({ size = 'md', className, fullPage = false }: LoadingSpinnerProps) {
  const spinner = (
    <div
      className={cn(
        'rounded-full border-line border-t-blue animate-spin',
        sizeClasses[size],
        className
      )}
    />
  );

  if (fullPage) {
    return (
      <div role="status" aria-live="polite" className="flex items-center justify-center h-40 w-full gap-3 text-muted text-sm">
        {spinner}
        <span>Loading…</span>
      </div>
    );
  }

  return spinner;
}
