import { cn } from '../../lib/utils';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

/**
 * Consistent page header for every admin module.
 * Replaces .at-header, .aa-header, .fa-header patterns.
 */
export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4 flex-wrap', className)}>
      <div className="min-w-0">
        <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight text-ink m-0 leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex items-center gap-2.5 flex-wrap flex-shrink-0 w-full sm:w-auto">{actions}</div>
      )}
    </div>
  );
}
