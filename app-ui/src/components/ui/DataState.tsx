import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './Button';
import { SkeletonList } from './Skeleton';
import type { DataStatus } from '../../hooks/useApiData';

/** Inline failure message with an optional Retry. */
export function ErrorState({
  message, onRetry, compact, className,
}: { message?: string | null; onRetry?: () => unknown; compact?: boolean; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center text-center gap-3',
        compact ? 'py-6 px-4' : 'py-12 px-6',
        className,
      )}
    >
      <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-danger/10 text-danger">
        <AlertTriangle size={20} aria-hidden="true" />
      </span>
      <div>
        <p className="text-md font-bold text-ink-2 m-0">Couldn’t load this</p>
        <p className="text-sm text-muted mt-1 mb-0 max-w-sm">{message || 'Something went wrong. Please try again.'}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={() => onRetry()}>
          <RefreshCw size={14} aria-hidden="true" /> Retry
        </Button>
      )}
    </div>
  );
}

/**
 * Slim notice for when a refresh failed but older data is still shown, or for
 * a background refresh in progress.
 */
export function RefreshNotice({
  error, refreshing, onRetry, className,
}: { error?: string | null; refreshing?: boolean; onRetry?: () => unknown; className?: string }) {
  if (error) {
    return (
      <div role="alert" className={cn('flex items-center gap-2.5 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-ink-2', className)}>
        <AlertTriangle size={15} className="text-danger shrink-0" aria-hidden="true" />
        <span className="flex-1 min-w-0">{error} Showing the last loaded data.</span>
        {onRetry && (
          <button type="button" onClick={() => onRetry()} className="shrink-0 font-semibold text-blue hover:underline">
            Retry
          </button>
        )}
      </div>
    );
  }
  if (refreshing) {
    return (
      <div role="status" className={cn('flex items-center gap-2 text-xs font-semibold text-muted', className)}>
        <RefreshCw size={13} className="animate-spin" aria-hidden="true" /> Updating…
      </div>
    );
  }
  return null;
}

interface DataStateProps {
  status: DataStatus;
  error?: string | null;
  /** Whether the successful result has nothing to show. */
  isEmpty?: boolean;
  onRetry?: () => unknown;
  /** Placeholder while the first result loads (defaults to list skeleton rows). */
  skeleton?: ReactNode;
  /** Shown only after a successful, empty response. */
  empty?: ReactNode;
  compact?: boolean;
  children: ReactNode;
}

/**
 * Picks the right view for a data-backed section:
 * skeleton → error with Retry → empty state → content.
 * An empty state is never shown before the first response arrives.
 */
export function DataState({ status, error, isEmpty, onRetry, skeleton, empty, compact, children }: DataStateProps) {
  if (status === 'loading') return <>{skeleton ?? <SkeletonList rows={compact ? 3 : 5} />}</>;
  if (status === 'error') return <ErrorState message={error} onRetry={onRetry} compact={compact} />;
  if (isEmpty) return <>{empty ?? null}</>;
  return <>{children}</>;
}
