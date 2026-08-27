import { useEffect, useRef } from 'react';

// Focus management for a modal/popup overlay: focuses the first focusable
// element on open, traps Tab/Shift+Tab inside the modal so keyboard focus
// can't silently escape behind the overlay, closes on Escape, and returns
// focus to whatever triggered the modal on close. Attach the returned ref
// to the modal's outer container (the one with role="dialog").
export function useModalA11y(onClose) {
  const containerRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    const container = containerRef.current;
    const getFocusable = () =>
      container?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') || [];

    getFocusable()[0]?.focus();

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused.current instanceof HTMLElement) previouslyFocused.current.focus();
    };
  }, [onClose]);

  return containerRef;
}
