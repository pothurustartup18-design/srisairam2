import { cn } from '../../lib/utils';
import type { ReactNode } from 'react';

interface KpiCardProps {
  label: string;
  value: ReactNode;
  subtext?: string;
  icon: ReactNode;
  iconBg: string;   // Tailwind bg class e.g. 'bg-purple-lt'
  iconColor: string; // Tailwind text class e.g. 'text-purple'
  valueColor?: string; // optional Tailwind text class e.g. 'text-green'
  className?: string;
}

/**
 * White KPI card with colored icon circle.
 * Replaces .at-kpi, .as-kpi, .aa-kpi, .db-kpi across all modules.
 */
export function KpiCard({
  label,
  value,
  subtext,
  icon,
  iconBg,
  iconColor,
  valueColor = 'text-ink',
  className,
}: KpiCardProps) {
  return (
    <div className={cn(
      'bg-surface border border-line rounded-xl p-3.5 sm:p-5 shadow-card flex flex-col gap-1 sm:gap-1.5 min-w-0',
      className
    )}>
      <div className="flex justify-between items-start">
        <div className={cn('w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center flex-shrink-0', iconBg, iconColor)}>
          {icon}
        </div>
      </div>
      <div className={cn('text-2xl sm:text-3xl font-extrabold tracking-tight leading-none mt-1.5 sm:mt-2 tabular', valueColor)}>{value}</div>
      <div className="text-sm text-muted font-medium">{label}</div>
      {subtext && <div className="text-xs text-faint">{subtext}</div>}
    </div>
  );
}
