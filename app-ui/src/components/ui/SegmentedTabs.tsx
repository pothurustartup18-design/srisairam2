import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface SegmentedTabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string; icon?: ReactNode }[];
  ariaLabel: string;
  className?: string;
}

/**
 * Segmented control for switching between sub-views of a screen. On phones
 * it wraps into a two-column grid (nothing scrolls off-screen); from `sm`
 * up it is a single inline strip.
 */
export function SegmentedTabs<T extends string>({ value, onChange, options, ariaLabel, className }: SegmentedTabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'grid grid-cols-2 sm:inline-flex gap-1 p-1 rounded-lg bg-surface-3 w-full sm:w-auto',
        options.length === 3 && 'grid-cols-3',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-[36px] px-3 rounded-md text-sm font-semibold whitespace-nowrap transition-colors min-w-0',
              active
                ? 'bg-surface text-blue-700 shadow-card dark:text-blue-300'
                : 'text-muted hover:text-ink hover:bg-surface/60',
            )}
          >
            {o.icon && <span className="shrink-0" aria-hidden="true">{o.icon}</span>}
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
