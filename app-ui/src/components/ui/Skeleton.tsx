import { cn } from '../../lib/utils';

/**
 * Placeholder blocks shown while content loads. Shapes mirror the real layout
 * so nothing jumps when data arrives. The shimmer stops under reduced motion.
 */
export function Skeleton({ className }: { className?: string }) {
  return <span className={cn('skeleton block rounded-md', className)} aria-hidden="true" />;
}

/** Announces loading to screen readers while the skeleton is visible. */
function LoadingRegion({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={cn('w-full min-w-0', className)}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Rows of a list: optional avatar, a title and a subtitle line. */
export function SkeletonList({
  rows = 5, avatar = true, label = 'Loading…', className,
}: { rows?: number; avatar?: boolean; label?: string; className?: string }) {
  return (
    <LoadingRegion label={label} className={cn('flex flex-col', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-line last:border-b-0">
          {avatar && <Skeleton className="w-9 h-9 rounded-full shrink-0" />}
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <Skeleton className={cn('h-3.5', i % 2 ? 'w-2/5' : 'w-1/2')} />
            <Skeleton className={cn('h-3', i % 3 ? 'w-3/5' : 'w-1/3')} />
          </div>
          <Skeleton className="h-6 w-14 rounded-full shrink-0" />
        </div>
      ))}
    </LoadingRegion>
  );
}

/** Table body placeholder that keeps the real header visible. Render inside <tbody>. */
export function SkeletonTableRows({ rows = 6, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} aria-hidden="true">
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className="px-4 py-3.5 border-b border-line">
              <Skeleton className={cn('h-3.5', c === 0 ? 'w-3/4' : (r + c) % 3 ? 'w-1/2' : 'w-2/3')} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** A row of KPI / stat tiles. */
export function SkeletonStats({ count = 4, label = 'Loading…', className }: { count?: number; label?: string; className?: string }) {
  return (
    <LoadingRegion label={label} className={cn('grid grid-cols-2 lg:grid-cols-4 gap-3', className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="bg-surface border border-line rounded-xl p-4 flex flex-col gap-3">
          <Skeleton className="w-9 h-9 rounded-lg" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      ))}
    </LoadingRegion>
  );
}

/** Generic card body: a heading and a few text lines. */
export function SkeletonCard({ lines = 3, label = 'Loading…', className }: { lines?: number; label?: string; className?: string }) {
  return (
    <LoadingRegion label={label} className={cn('bg-surface border border-line rounded-xl p-5 flex flex-col gap-3', className)}>
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-1/2' : 'w-full')} />
      ))}
    </LoadingRegion>
  );
}

/** Placeholder for a whole screen while its bundle or first data loads. */
export function SkeletonPage({ label = 'Loading…' }: { label?: string }) {
  return (
    <LoadingRegion label={label} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-48 max-w-[60%]" />
        <Skeleton className="h-3.5 w-72 max-w-[80%]" />
      </div>
      <SkeletonStats />
      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <SkeletonList rows={4} />
      </div>
    </LoadingRegion>
  );
}
