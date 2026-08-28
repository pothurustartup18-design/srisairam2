import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import type { ReactNode } from 'react';

const badgeVariants = cva(
  'inline-flex items-center gap-1 font-bold rounded-full border whitespace-nowrap',
  {
    variants: {
      variant: {
        blue:   'bg-blue-lt   text-blue     border-blue-200',
        green:  'bg-green-lt  text-green-800 border-green-200',
        red:    'bg-red-lt    text-red-700   border-red-200',
        amber:  'bg-amber-lt  text-amber-800 border-amber-200',
        purple: 'bg-purple-lt text-purple    border-purple-200',
        gray:   'bg-slate-100 text-slate-600 border-slate-200',
      },
      size: {
        sm: 'text-2xs px-2 py-0.5',
        md: 'text-xs  px-2.5 py-1',
      },
    },
    defaultVariants: {
      variant: 'blue',
      size: 'md',
    },
  }
);

interface BadgeProps extends VariantProps<typeof badgeVariants> {
  children: ReactNode;
  className?: string;
}

/**
 * Semantic badge / chip / status pill.
 * Replaces .at-status-badge, .as-class-chip, .aa-status, .fee-badge across all modules.
 */
export function Badge({ variant, size, children, className }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)}>
      {children}
    </span>
  );
}

export { badgeVariants };
