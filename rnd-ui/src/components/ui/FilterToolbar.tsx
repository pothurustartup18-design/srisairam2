import { cn } from '../../lib/utils';
import type { ReactNode } from 'react';

interface FilterToolbarProps {
  children: ReactNode;
  className?: string;
}

/**
 * White card toolbar for filters, search, and bulk actions.
 * Replaces .at-toolbar, .as-toolbar, .aa-toolbar across modules.
 */
export function FilterToolbar({ children, className }: FilterToolbarProps) {
  return (
    <div className={cn(
      'bg-white border border-slate-200 rounded-lg px-4 sm:px-5 py-4 shadow-card',
      'flex flex-wrap gap-3 items-end',
      className
    )}>
      {children}
    </div>
  );
}

interface FilterGroupProps {
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * A labelled filter field group (label + input/select).
 */
export function FilterGroup({ label, children, className }: FilterGroupProps) {
  return (
    <div className={cn('flex flex-col gap-1.5 w-full sm:w-auto sm:min-w-[110px]', className)}>
      <label className="text-2xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Shared filter input/select base style — 44px minimum touch target */
export const filterControlClass =
  'h-11 px-3 border-[1.5px] border-slate-200 rounded-md text-sm text-slate-900 bg-white outline-none transition-colors focus:border-blue font-[inherit] w-full';

/** Vertical divider between toolbar sections */
export function ToolbarDivider() {
  return <div className="hidden sm:block w-px self-stretch bg-slate-200 mx-1" />;
}
