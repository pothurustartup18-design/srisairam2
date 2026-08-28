import { cn } from '../../lib/utils';
import type { ReactNode, TableHTMLAttributes } from 'react';

interface DataTableProps extends TableHTMLAttributes<HTMLTableElement> {
  children: ReactNode;
  /** Wrap in a card-style container with border/shadow */
  card?: boolean;
  /** Header slot rendered above the table (title, actions, etc.) */
  header?: ReactNode;
  /** Footer slot rendered below the table (e.g. sticky save bar) */
  footer?: ReactNode;
  containerClassName?: string;
}

/**
 * Shared data table wrapper with sticky thead, consistent row styles, and card container.
 * Replaces .at-table, .as-table, .aa-table across all modules.
 *
 * Usage:
 *   <DataTable card header={<div>Title</div>}>
 *     <thead>...</thead>
 *     <tbody>...</tbody>
 *   </DataTable>
 */
export function DataTable({
  children,
  card = true,
  header,
  footer,
  className,
  containerClassName,
  ...props
}: DataTableProps) {
  const tableEl = (
    <div className="overflow-x-auto">
      <table
        className={cn('w-full border-collapse text-left', className)}
        {...props}
      >
        {children}
      </table>
    </div>
  );

  if (!card) return tableEl;

  return (
    <div className={cn('bg-white border border-slate-200 rounded-lg shadow-card overflow-hidden', containerClassName)}>
      {header && (
        <div className="px-5 py-4 border-b border-slate-200">
          {header}
        </div>
      )}
      {tableEl}
      {footer && (
        <div className="border-t border-slate-200">
          {footer}
        </div>
      )}
    </div>
  );
}

/** Reusable th — sticky, uppercase label style */
export function Th({ children, className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-slate-500',
        'bg-slate-50 border-b border-slate-200 sticky top-0 z-10 whitespace-nowrap',
        className
      )}
      {...props}
    >
      {children}
    </th>
  );
}

/** Reusable td — consistent padding and border */
export function Td({ children, className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn('px-4 py-3.5 border-b border-slate-100 text-sm text-slate-700 align-middle', className)}
      {...props}
    >
      {children}
    </td>
  );
}

/** Table row with consistent hover state */
export function Tr({ children, className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('hover:bg-slate-50 transition-colors', className)}
      {...props}
    >
      {children}
    </tr>
  );
}
