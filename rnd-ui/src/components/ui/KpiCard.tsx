import { cn } from '../../lib/utils';
import type { ReactNode } from 'react';

interface KpiCardProps {
  label: string;
  value: string | number;
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
  valueColor = 'text-slate-900',
  className,
}: KpiCardProps) {
  return (
    <div className={cn(
      'bg-white border border-slate-200 rounded-lg p-5 shadow-card flex flex-col gap-1.5',
      className
    )}>
      <div className="flex justify-between items-start">
        <div className={cn('w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0', iconBg, iconColor)}>
          {icon}
        </div>
      </div>
      <div className={cn('text-4xl font-bold leading-none mt-1', valueColor)}>{value}</div>
      <div className="text-sm text-slate-500 font-medium">{label}</div>
      {subtext && <div className="text-xs text-slate-400">{subtext}</div>}
    </div>
  );
}
