import { cn } from '../../lib/utils';
import type { ReactNode } from 'react';

interface MobileRowCardField {
  label: string;
  value: ReactNode;
  /** Span both columns of the field grid (for long values). */
  fullWidth?: boolean;
}

interface MobileRowCardProps {
  /** Primary heading — student name, exam name, thread name, etc. */
  title: ReactNode;
  /** Secondary line under the title — admission no, date, etc. */
  subtitle?: ReactNode;
  /** Status badge/chip shown at the top-right of the card header. */
  badge?: ReactNode;
  /** Label/value pairs rendered as a 2-column mini-grid below the header. */
  fields?: MobileRowCardField[];
  /** Footer action buttons (Edit/Delete/Message/etc.). */
  actions?: ReactNode;
  onClick?: () => void;
  className?: string;
}

/**
 * One "row" of tabular data rendered as a stacked card — the phone-width
 * fallback for `DataTable` rows. Pair with `MobileCardList` and hide the
 * corresponding `<DataTable>` at `hidden md:block` on the same page.
 */
export function MobileRowCard({ title, subtitle, badge, fields, actions, onClick, className }: MobileRowCardProps) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className={cn(
        'bg-white border border-slate-200 rounded-lg shadow-card p-4 flex flex-col gap-3 text-left w-full',
        onClick && 'cursor-pointer active:bg-slate-50 transition-colors',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-900 truncate">{title}</div>
          {subtitle && <div className="text-xs text-slate-400 mt-0.5 truncate">{subtitle}</div>}
        </div>
        {badge && <div className="flex-shrink-0">{badge}</div>}
      </div>

      {fields && fields.length > 0 && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-slate-100 pt-3">
          {fields.map((f, i) => (
            <div key={i} className={cn('flex flex-col gap-0.5 min-w-0', f.fullWidth && 'col-span-2')}>
              <span className="text-2xs font-bold uppercase tracking-wide text-slate-400">{f.label}</span>
              <span className="text-sm text-slate-700 break-words">{f.value}</span>
            </div>
          ))}
        </div>
      )}

      {actions && (
        <div className="flex items-center gap-2 flex-wrap border-t border-slate-100 pt-3">
          {actions}
        </div>
      )}
    </div>
  );
}

/** Stacking container for `MobileRowCard`s — visible only below `md` (768px). */
export function MobileCardList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-3 md:hidden', className)}>{children}</div>;
}
