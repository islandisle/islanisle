import { useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useModalA11y } from '../useModalA11y';

// A small popup panel anchored just below a trigger element. Portalled to
// <body> so it is never clipped by an ancestor's overflow — the Home header
// clips its decorative weather line-art with overflow:hidden, which would
// otherwise cut off anything opening downward from the header.
//
// Deliberately not a full-screen overlay: the backdrop is invisible (it only
// exists to catch an outside click), the panel is sized to its content, and
// it re-anchors on scroll/resize. Escape / outside-click / focus-trap come
// from the shared useModalA11y hook, same as the app's other popups.
//
//   anchorRef   — ref to the element the panel hangs off of
//   align       — 'left' (panel's left edge under the anchor's left, default)
//                 or 'right' (panel's right edge under the anchor's right)
//   translucent — slightly see-through panel (.panel-translucent) instead of
//                 the opaque .card surface
export default function AnchoredPopover({
  anchorRef,
  onClose,
  children,
  ariaLabel,
  width = 260,
  align = 'left',
  translucent = false,
}) {
  const [pos, setPos] = useState(null);
  const modalRef = useModalA11y(onClose);

  useLayoutEffect(() => {
    function update() {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const margin = 12;
      const maxLeft = Math.max(margin, window.innerWidth - width - margin);
      let left = align === 'right' ? r.right - width : r.left;
      left = Math.max(margin, Math.min(left, maxLeft));
      setPos({ top: r.bottom + 6, left });
    }
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef, width, align]);

  if (!pos) return null;

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 300 }}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={translucent ? 'panel-translucent' : 'card'}
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          width,
          maxWidth: 'calc(100vw - 24px)',
          maxHeight: `calc(100vh - ${pos.top + 12}px)`,
          overflowY: 'auto',
          padding: 12,
          zIndex: 301,
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
          boxShadow: '0 10px 30px rgba(11, 46, 61, 0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
