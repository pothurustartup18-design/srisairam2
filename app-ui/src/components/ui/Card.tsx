import type { ReactNode, ElementType, HTMLAttributes } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Remove inner padding (for lists and tables that run edge to edge). */
  flush?: boolean;
  as?: ElementType;
}

/** The standard surface: white, hairline border, soft shadow. */
export function Card({ flush, as: Tag = 'div', className, children, ...props }: CardProps) {
  return (
    <Tag
      className={cn('bg-surface border border-line rounded-xl shadow-card', !flush && 'p-4 sm:p-5', className)}
      {...props}
    >
      {children}
    </Tag>
  );
}

interface SectionHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** "See all" style link on the right. */
  actionLabel?: string;
  onAction?: () => void;
  /** Arbitrary right-side content (overrides actionLabel). */
  action?: ReactNode;
  className?: string;
}

/** Heading row used above every card or list section. */
export function SectionHeader({ title, subtitle, actionLabel, onAction, action, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex justify-between gap-3 min-w-0', subtitle ? 'items-end' : 'items-center', className)}>
      <div className="min-w-0">
        <h2 className="m-0 text-md font-bold text-ink tracking-tight truncate">{title}</h2>
        {subtitle && <p className="m-0 mt-0.5 text-xs text-muted truncate">{subtitle}</p>}
      </div>
      {action ?? (actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-0.5 min-h-tap -my-2.5 px-1 text-sm font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-300 shrink-0"
        >
          {actionLabel} <ChevronRight size={15} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const toneValue: Record<Tone, string> = {
  neutral: 'text-ink',
  brand: 'text-blue-700 dark:text-blue-300',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};
const toneIcon: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-2',
  brand: 'bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  onClick?: () => void;
  className?: string;
}

/** Compact metric tile. Becomes a button when `onClick` is given. */
export function StatTile({ label, value, hint, icon, tone = 'neutral', onClick, className }: StatTileProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex flex-col gap-2 min-w-0 text-left bg-surface border border-line rounded-xl shadow-card p-3.5 sm:p-4',
        onClick && 'cursor-pointer transition-colors hover:border-line-strong active:bg-surface-2',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="text-xs font-semibold text-muted truncate">{label}</span>
        {icon && <span className={cn('inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0', toneIcon[tone])}>{icon}</span>}
      </div>
      <span className={cn('text-2xl sm:text-3xl font-extrabold leading-none tracking-tight tabular', toneValue[tone])}>{value}</span>
      {hint && <span className="text-xs text-muted truncate">{hint}</span>}
    </Tag>
  );
}

interface QuickActionProps {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  badge?: number;
  tone?: Tone;
}

/** Icon + label shortcut used in dashboard "Quick actions" grids. */
export function QuickAction({ label, icon, onClick, badge, tone = 'brand' }: QuickActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col items-center justify-center gap-2 min-w-0 min-h-[88px] p-3 rounded-xl border border-line bg-surface hover:border-line-strong hover:bg-surface-2 active:bg-surface-3 transition-colors text-center"
    >
      <span className={cn('relative inline-flex items-center justify-center w-10 h-10 rounded-xl', toneIcon[tone])}>
        {icon}
        {!!badge && badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10.5px] font-bold leading-[18px] ring-2 ring-surface">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span className="text-xs font-semibold text-ink-2 leading-tight line-clamp-2">{label}</span>
    </button>
  );
}

interface ListRowProps {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
}

/** A tappable list row with chevron — the phone-native list idiom. */
export function ListRow({ leading, title, subtitle, trailing, onClick, className }: ListRowProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 w-full min-h-[60px] px-4 py-3 text-left bg-transparent border-0',
        onClick && 'cursor-pointer hover:bg-surface-2 active:bg-surface-3 transition-colors',
        className,
      )}
    >
      {leading && <span className="shrink-0">{leading}</span>}
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-ink truncate">{title}</span>
        {subtitle && <span className="block text-xs text-muted truncate mt-0.5">{subtitle}</span>}
      </span>
      {trailing && <span className="shrink-0 flex items-center gap-2">{trailing}</span>}
      {onClick && <ChevronRight size={16} className="shrink-0 text-faint" aria-hidden="true" />}
    </Tag>
  );
}
