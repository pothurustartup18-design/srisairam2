import { useEffect, useRef } from 'react';
import { registerBackHandler } from './useMobileApp';

/**
 * Shared behaviour for modal surfaces (dialogs, drawers, sheets) while open:
 * Escape and the Android back button close it, the page behind stops
 * scrolling, focus moves into the panel and returns to the opener afterwards.
 */
export function useOverlay(isOpen: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into the panel (without popping the phone keyboard) unless a
    // field inside already took it via autoFocus
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    const unregister = registerBackHandler(() => { closeRef.current(); return true; });

    return () => {
      document.removeEventListener('keydown', onKey);
      unregister();
      document.body.style.overflow = prevOverflow;
      opener?.focus?.({ preventScroll: true });
    };
  }, [isOpen]);

  return panelRef;
}
