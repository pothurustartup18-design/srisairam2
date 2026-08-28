import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';

const buttonVariants = cva(
  // Base styles shared by every variant
  'inline-flex items-center justify-center gap-1.5 font-semibold rounded-md border transition-all duration-150 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap',
  {
    variants: {
      variant: {
        primary:   'bg-blue text-white border-blue hover:bg-blue-dk',
        secondary: 'bg-white text-slate-900 border-slate-200 hover:bg-slate-50 hover:border-slate-300',
        danger:    'bg-red-lt text-red border-red-200 hover:bg-red-200',
        success:   'bg-green-lt text-green border-green-200 hover:bg-green-200',
        ghost:     'bg-transparent text-slate-600 border-transparent hover:bg-slate-100',
        outline:   'bg-white text-blue border-blue hover:bg-blue-lt',
      },
      size: {
        // md/lg/icon are the sizes used for primary, standalone, and mobile
        // card-row actions — kept at/above the 44px touch-target minimum.
        // sm/icon-sm stay compact for dense, pointer-driven desktop table rows
        // (those actions live inside `hidden md:block` tables, not mobile views).
        sm: 'h-[34px] px-3 text-sm',
        md: 'h-11 px-4 text-sm',
        lg: 'h-12 px-5 text-base',
        icon: 'h-11 w-11 p-0',
        'icon-sm': 'h-[32px] w-[32px] p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

export { buttonVariants };
