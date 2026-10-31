import { cn } from '../../lib/utils';

/**
 * The one place that reserves room for the Android status bar / notch at the top of a full-screen
 * view. Put it as the first child of any panel that starts at the very top of the screen, with the
 * same background as that panel's header so the two read as one bar. It is 0px tall in a normal
 * browser, so desktop layouts are unaffected.
 */
export function StatusBarSpacer({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('flex-shrink-0 bg-white', className)} style={{ height: 'env(safe-area-inset-top, 0px)' }} />;
}
