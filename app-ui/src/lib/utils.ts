import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * cn() — merge Tailwind classes safely.
 * Combines clsx (conditional classes) + twMerge (conflict resolution).
 * Usage: cn('px-4 py-2', isActive && 'bg-blue text-white', className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Returns YYYY-MM-DD in user's local timezone (avoiding UTC offset shifts)
 */
export function getLocalToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Returns YYYY-MM in user's local timezone
 */
export function getLocalMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
