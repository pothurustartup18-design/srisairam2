import { cn } from '../../lib/utils';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Consistent empty-state illustration block.
 * Replaces .at-empty, .as-empty, .aa-empty across all modules.
 */
export function EmptyState({ icon, title, subtitle, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 px-6 text-center', className)}>
      {icon && (
        <div className="text-slate-300 mb-3.5">{icon}</div>
      )}
      <p className="text-md font-bold text-slate-700 m-0">{title}</p>
      {subtitle && <p className="text-sm text-slate-400 mt-1.5">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
